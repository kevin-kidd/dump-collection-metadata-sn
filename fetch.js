const fs = require("fs");
const {SecretNetworkClient} = require("secretjs");

const fetchMetadata = async (contractAddress) => {
    const queryClient = await SecretNetworkClient.create({
        grpcWebUrl: "https://secret-4.api.trivium.network:9091",
        chainId: "secret-4",
    });

    // Grab the code hash for the contract to make queries faster
    const codeHash = await queryClient.query.compute.contractCodeHash(contractAddress);

    // Grab the contract info so we have the collection name
    const contractInfoResponse = await queryClient.query.compute.queryContract({
        contractAddress: contractAddress,
        codeHash: codeHash,
        query: {
            contract_info: {}
        },
    });
    if(!contractInfoResponse.contract_info || !contractInfoResponse.contract_info.name) {
        console.error(`Failed to fetch 'contract_info' for ${contractAddress}`);
        return;
    }
    const collectionName = contractInfoResponse.contract_info.name;


    // Grab the total number of tokens so we can set the limit for our `all_tokens` query
    const numTokensResponse = await queryClient.query.compute.queryContract({
        contractAddress: contractAddress,
        codeHash: codeHash,
        query: {
            num_tokens: {}
        },
    });
    if(!numTokensResponse.num_tokens || !numTokensResponse.num_tokens.count) {
        console.error(`Failed to fetch 'num_tokens' for ${collectionName}`);
        return;
    }
    const numTokens = numTokensResponse.num_tokens.count;
    if(numTokens === 0) {
        console.error("The collection does not have any tokens!");
        return;
    }

    // Grab all token IDs in the collection so we can fetch the metadata directly
    const allTokensResponse = await queryClient.query.compute.queryContract({
        contractAddress: contractAddress,
        codeHash: codeHash,
        query: {
            all_tokens: {
                limit: numTokens
            }
        },
    });
    if(!allTokensResponse.token_list) {
        console.error(`Failed to fetch 'all_tokens' for ${collectionName}`);
        return;
    }
    const tokenIds = allTokensResponse.token_list.tokens
    if(tokenIds.length === 0) {
        console.error("Did not get any token IDs from the 'all_tokens' query!");
        return;
    }
    console.log(`Found ${tokenIds.length} tokens in collection: ${collectionName}`);

    // Grab the metadata of each token in the collection
    let metadata = [];
    for(const tokenId of tokenIds) {
        const metadataResponse = await queryClient.query.compute.queryContract({
            contractAddress: contractAddress,
            codeHash: codeHash,
            query: {
                nft_info: {
                    token_id: tokenId
                }
            },
        });
        if(!metadataResponse.nft_info) {
            console.error(`Failed to fetch 'nft_info' for ${collectionName} (#${tokenId})`);
        }
        metadata.push(metadataResponse.nft_info.token_uri ?? metadataResponse.nft_info.extension);
    }
    console.log(`Fetched ${metadata.length} metadata objects for collection: ${collectionName}`);
    fs.writeFileSync(`./output/${collectionName} (${numTokens}).json`, JSON.stringify(metadata, null, 2), { encoding: "utf8" });
}

const args = process.argv.slice(2);
if (args.length === 0) {
    console.error("Incorrect arguments provided!");
} else if(args.length === 2 && args[0] === "--contract-address"){
    fetchMetadata(args[1])
        .then(() => console.log("Success! Your metadata has been saved to the `output` directory."))
        .catch((error) => {
            if(error.message.includes("decoding bech32 failed")) {
                console.error("Incorrect contract address provided!");
            } else {
                console.error(error)
            }
        });
} else {
    console.error("Incorrect arguments provided!");
}
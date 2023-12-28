# Azuro-api

This directory contains the Azuro API subgraph, which provides endpoints for accessing data on different networks. The API is compatible with various networks, including Arbitrum, Gnosis, Polygon and Linea. You can find the endpoints for both production and development environments below.

## Endpoints

### Production

- Gnosis: <https://thegraph.azuro.org/subgraphs/name/azuro-protocol/azuro-api-gnosis-v3>
- Polygon: <https://thegraph.azuro.org/subgraphs/name/azuro-protocol/azuro-api-polygon-v3>
- Arbitrum: <https://thegraph.azuro.org/subgraphs/name/azuro-protocol/azuro-api-arbitrum-one-v3>
- Linea: <https://thegraph.azuro.org/subgraphs/name/azuro-protocol/azuro-api-linea-v3>
- Polygon Mumbai (AZUSD): <https://thegraph.azuro.org/subgraphs/name/azuro-protocol/azuro-api-mumbai-v3>

### Development

- Gnosis: <https://thegraph.azuro.org/subgraphs/name/azuro-protocol/azuro-api-gnosis-dev-v3>
- Polygon: <https://thegraph.azuro.org/subgraphs/name/azuro-protocol/azuro-api-mumbai-dev-v3>
- Arbitrum: <https://thegraph.azuro.org/subgraphs/name/azuro-protocol/azuro-api-arbitrum-goerli-dev-v3>
- Linea: <https://thegraph.azuro.org/subgraphs/name/azuro-protocol/azuro-api-linea-goerli-dev-v3>

## Running You Own Subgraph

At present, support for The Graph's decentralized network is not provided due to the use of IPFS for game information storage. Future releases, however, are intended to eliminate this dependency on IPFS and incorporate support for decentralized networks. In the interim, the recommendation is to utilize the provided endpoints or deploy subgraphs to the hosted services.

1. Install the graph-cli by running `npm install -g @graphprotocol/graph-cli`
2. Install the required packages by running `npm ci`
3. Edit the configuration file `config/<NETWORK>.js` (or create a new one) to support your smart contracts. This directory contains pre-configured addresses and start blocks of Azuro Protocol contracts. For more details, refer to [the documentation](https://thegraph.com/docs/en/developing/creating-a-subgraph/).
4. Update the `src/whitelists.ts` file to support your Liquidity Pools and Express Bets contracts.
5. Run `CONFIG=<NETWORK> npm run generate` to create the `subgraph.yaml` file and perform code generation. Alternatively, you can use predefined tasks from the package.json file, such as npm run generate-gnosis-dev.
6. Initialize the subgraph by running `graph create <SUBGRAPH_NAME> --node <NODE_URL> --deploy-key <DEPLOY_KEY>`.
7. Deploy the subgraph by running `graph deploy <SUBGRAPH_NAME> --version-label <VERSION_NAME> --node <NODE_URL> --ipfs <IPFS_NODE_URL> --deploy-key <DEPLOY_KEY>`.

For more detailed instructions, please refer to [The Graph documentation](https://thegraph.com/docs/en/deploying/deploying-a-subgraph-to-hosted/).

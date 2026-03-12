export const PREDICTION_MARKET_ABI = [
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "marketId",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "outcomeId",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "shares",
                "type": "uint256"
            }
        ],
        "name": "buyShares",
        "outputs": [],
        "stateMutability": "payable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "string",
                "name": "title",
                "type": "string"
            },
            {
                "internalType": "string",
                "name": "description",
                "type": "string"
            },
            {
                "internalType": "uint256",
                "name": "endTime",
                "type": "uint256"
            },
            {
                "internalType": "string[]",
                "name": "outcomeNames",
                "type": "string[]"
            }
        ],
        "name": "createMarket",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "marketId",
                "type": "uint256"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "uint256",
                "name": "marketId",
                "type": "uint256"
            },
            {
                "indexed": true,
                "internalType": "uint256",
                "name": "outcomeId",
                "type": "uint256"
            },
            {
                "indexed": true,
                "internalType": "address",
                "name": "buyer",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "shares",
                "type": "uint256"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "cost",
                "type": "uint256"
            }
        ],
        "name": "SharesPurchased",
        "type": "event"
    }
] as const;

// TODO: Replace with deployed contract address
export const PREDICTION_MARKET_ADDRESS = "0x0000000000000000000000000000000000000000"; 

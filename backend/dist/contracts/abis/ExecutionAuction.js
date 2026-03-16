"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecutionAuctionAbi = void 0;
exports.ExecutionAuctionAbi = [
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "engine_",
                "type": "address"
            },
            {
                "internalType": "address",
                "name": "vault_",
                "type": "address"
            },
            {
                "internalType": "address",
                "name": "usdt_",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "bidWindow_",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "executeWindow_",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "minBid_",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "minBidIncrementBps_",
                "type": "uint256"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "constructor"
    },
    {
        "inputs": [],
        "name": "ExecutionAuction__BelowMinBid",
        "type": "error"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "required",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "provided",
                "type": "uint256"
            }
        ],
        "name": "ExecutionAuction__BidIncrementTooLow",
        "type": "error"
    },
    {
        "inputs": [],
        "name": "ExecutionAuction__BidTooLow",
        "type": "error"
    },
    {
        "inputs": [],
        "name": "ExecutionAuction__EngineNotReady",
        "type": "error"
    },
    {
        "inputs": [],
        "name": "ExecutionAuction__NoRefund",
        "type": "error"
    },
    {
        "inputs": [],
        "name": "ExecutionAuction__NotBidPhase",
        "type": "error"
    },
    {
        "inputs": [],
        "name": "ExecutionAuction__NotExecutePhase",
        "type": "error"
    },
    {
        "inputs": [],
        "name": "ExecutionAuction__NotFallbackPhase",
        "type": "error"
    },
    {
        "inputs": [],
        "name": "ExecutionAuction__NotWinner",
        "type": "error"
    },
    {
        "inputs": [],
        "name": "ExecutionAuction__ZeroAddress",
        "type": "error"
    },
    {
        "inputs": [],
        "name": "ExecutionAuction__ZeroWindow",
        "type": "error"
    },
    {
        "inputs": [],
        "name": "ReentrancyGuardReentrantCall",
        "type": "error"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "token",
                "type": "address"
            }
        ],
        "name": "SafeERC20FailedOperation",
        "type": "error"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "uint256",
                "name": "id",
                "type": "uint256"
            },
            {
                "indexed": true,
                "internalType": "address",
                "name": "bidder",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "bid",
                "type": "uint256"
            },
            {
                "indexed": false,
                "internalType": "address",
                "name": "outbid",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "outbidAmount",
                "type": "uint256"
            }
        ],
        "name": "BidPlaced",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "uint256",
                "name": "id",
                "type": "uint256"
            },
            {
                "indexed": true,
                "internalType": "address",
                "name": "executor",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "bidToVault",
                "type": "uint256"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "bountyToExecutor",
                "type": "uint256"
            },
            {
                "indexed": false,
                "internalType": "bool",
                "name": "byWinner",
                "type": "bool"
            }
        ],
        "name": "Executed",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "address",
                "name": "to",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "amount",
                "type": "uint256"
            }
        ],
        "name": "Refunded",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "uint256",
                "name": "id",
                "type": "uint256"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "timestamp",
                "type": "uint256"
            }
        ],
        "name": "RoundOpened",
        "type": "event"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "amount",
                "type": "uint256"
            }
        ],
        "name": "bid",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "bidWindow",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "claimRefund",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "engine",
        "outputs": [
            {
                "internalType": "contract IStrategyEngine",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "executeWindow",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "fallbackExecute",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "minBid",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "minBidIncrementBps",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "",
                "type": "address"
            }
        ],
        "name": "pendingRefunds",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "phase",
        "outputs": [
            {
                "internalType": "enum ExecutionAuction.Phase",
                "name": "",
                "type": "uint8"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "round",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "id",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "openedAt",
                "type": "uint256"
            },
            {
                "internalType": "address",
                "name": "winner",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "winningBid",
                "type": "uint256"
            },
            {
                "internalType": "bool",
                "name": "closed",
                "type": "bool"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "roundStatus",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "id",
                "type": "uint256"
            },
            {
                "internalType": "enum ExecutionAuction.Phase",
                "name": "currentPhase",
                "type": "uint8"
            },
            {
                "internalType": "address",
                "name": "winner",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "winningBid",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "bidTimeRemaining",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "executeTimeRemaining",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "stats",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "totalRounds",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "bidRevenue",
                "type": "uint256"
            },
            {
                "internalType": "enum ExecutionAuction.Phase",
                "name": "currentPhase_",
                "type": "uint8"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "totalBidRevenue",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "usdt",
        "outputs": [
            {
                "internalType": "contract IERC20",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "vault",
        "outputs": [
            {
                "internalType": "address",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "winnerExecute",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
];

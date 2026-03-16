"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircuitBreakerAbi = void 0;
exports.CircuitBreakerAbi = [
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_chainlinkFeed",
                "type": "address"
            },
            {
                "internalType": "address",
                "name": "_stableSwapPool",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "_signalAThresholdBps",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "_signalBThresholdBps",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "_signalCThresholdBps",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "_recoveryCooldown",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "_chainlinkStalePeriod",
                "type": "uint256"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "constructor"
    },
    {
        "inputs": [],
        "name": "CircuitBreaker__InvalidThreshold",
        "type": "error"
    },
    {
        "inputs": [],
        "name": "CircuitBreaker__NotPaused",
        "type": "error"
    },
    {
        "inputs": [],
        "name": "CircuitBreaker__ZeroAddress",
        "type": "error"
    },
    {
        "inputs": [],
        "name": "CircuitBreaker__ZeroCooldown",
        "type": "error"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "pausedDuration",
                "type": "uint256"
            }
        ],
        "name": "BreakerRecovered",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": false,
                "internalType": "bool",
                "name": "signalA",
                "type": "bool"
            },
            {
                "indexed": false,
                "internalType": "bool",
                "name": "signalB",
                "type": "bool"
            },
            {
                "indexed": false,
                "internalType": "bool",
                "name": "signalC",
                "type": "bool"
            }
        ],
        "name": "BreakerTripped",
        "type": "event"
    },
    {
        "inputs": [],
        "name": "BPS_DENOMINATOR",
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
        "name": "chainlinkFeed",
        "outputs": [
            {
                "internalType": "contract IChainlinkAggregator",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "chainlinkStalePeriod",
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
        "name": "checkBreaker",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "isPaused",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "lastTripTimestamp",
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
        "name": "lastVirtualPrice",
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
        "name": "owner",
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
        "name": "paused",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "previewBreaker",
        "outputs": [
            {
                "components": [
                    {
                        "internalType": "bool",
                        "name": "paused",
                        "type": "bool"
                    },
                    {
                        "internalType": "bool",
                        "name": "signalA",
                        "type": "bool"
                    },
                    {
                        "internalType": "bool",
                        "name": "signalB",
                        "type": "bool"
                    },
                    {
                        "internalType": "bool",
                        "name": "signalC",
                        "type": "bool"
                    },
                    {
                        "internalType": "uint256",
                        "name": "lastTripTimestamp",
                        "type": "uint256"
                    },
                    {
                        "internalType": "uint256",
                        "name": "recoveryTimestamp",
                        "type": "uint256"
                    }
                ],
                "internalType": "struct ICircuitBreaker.BreakerStatus",
                "name": "status",
                "type": "tuple"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "recoveryCooldown",
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
        "name": "signalAThresholdBps",
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
        "name": "signalBThresholdBps",
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
        "name": "signalCThresholdBps",
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
        "name": "stableSwapPool",
        "outputs": [
            {
                "internalType": "contract IStableSwapPool",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "unpause",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
];

export const ZKRiskOracleAbi = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_zkVerifier",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      }
    ],
    "name": "OwnableInvalidOwner",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "OwnableUnauthorizedAccount",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ZKRiskOracle__UnauthorizedVerifier",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ZKRiskOracle__ZeroAddress",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "previousOwner",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "OwnershipTransferStarted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "previousOwner",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "OwnershipTransferred",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint32",
        "name": "sharpe",
        "type": "uint32"
      },
      {
        "indexed": false,
        "internalType": "uint32",
        "name": "drawdown",
        "type": "uint32"
      },
      {
        "indexed": false,
        "internalType": "uint32",
        "name": "buffer",
        "type": "uint32"
      }
    ],
    "name": "RiskMetricsVerified",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "oldVerifier",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newVerifier",
        "type": "address"
      }
    ],
    "name": "ZkVerifierUpdated",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "acceptOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      },
      {
        "internalType": "bytes",
        "name": "",
        "type": "bytes"
      },
      {
        "internalType": "uint32",
        "name": "_computedSharpe",
        "type": "uint32"
      },
      {
        "internalType": "uint32",
        "name": "_computedDrawdownBps",
        "type": "uint32"
      },
      {
        "internalType": "uint32",
        "name": "_recommendedBufferBps",
        "type": "uint32"
      }
    ],
    "name": "fulfillRiskCalculation",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getVerifiedRiskBands",
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint32",
            "name": "timestamp",
            "type": "uint32"
          },
          {
            "internalType": "uint32",
            "name": "verifiedSharpeRatio",
            "type": "uint32"
          },
          {
            "internalType": "uint32",
            "name": "monteCarloDrawdownBps",
            "type": "uint32"
          },
          {
            "internalType": "uint32",
            "name": "recommendedBufferBps",
            "type": "uint32"
          }
        ],
        "internalType": "struct ZKRiskOracle.RiskMetrics",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "latestMetrics",
    "outputs": [
      {
        "internalType": "uint32",
        "name": "timestamp",
        "type": "uint32"
      },
      {
        "internalType": "uint32",
        "name": "verifiedSharpeRatio",
        "type": "uint32"
      },
      {
        "internalType": "uint32",
        "name": "monteCarloDrawdownBps",
        "type": "uint32"
      },
      {
        "internalType": "uint32",
        "name": "recommendedBufferBps",
        "type": "uint32"
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
    "name": "pendingOwner",
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
    "name": "renounceOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_newVerifier",
        "type": "address"
      }
    ],
    "name": "setZkVerifier",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "zkVerifier",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

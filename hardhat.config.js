require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const BNB_TESTNET_RPC_URL = process.env.BNB_TESTNET_RPC_URL || "";
const BNB_MAINNET_RPC_URL = process.env.BNB_MAINNET_RPC_URL || "";
const CREDITCOIN_TESTNET_RPC_URL = process.env.CREDITCOIN_TESTNET_RPC_URL || "https://rpc.cc3-testnet.creditcoin.network";
const RAW_PRIVATE_KEY = (process.env.PRIVATE_KEY || "").trim();
const PRIVATE_KEY = RAW_PRIVATE_KEY
  ? RAW_PRIVATE_KEY.startsWith("0x")
    ? RAW_PRIVATE_KEY
    : `0x${RAW_PRIVATE_KEY}`
  : "";

// Gas price constants (in wei).
// Uses parseFloat so fractional gwei (e.g. GAS_PRICE_GWEI=0.1) is supported.
// BSC mainnet minimum is 1 gwei; default 3 gwei is conservative for busy blocks.
// Override via GAS_PRICE_GWEI env var — accepts decimals (e.g. "0.1" → 100_000_000 wei).
const GAS_PRICE_MAINNET = Math.round(
  parseFloat(process.env.GAS_PRICE_GWEI || "3") * 1_000_000_000
);
const GAS_PRICE_TESTNET = Math.round(
  parseFloat(process.env.GAS_PRICE_GWEI || "3") * 1_000_000_000
);
const GAS_PRICE_CREDITCOIN = Math.round(
  parseFloat(process.env.GAS_PRICE_GWEI || "10000000") * 1_000_000_000
);

// Polkadot Hub configuration
const POLKADOT_HUB_TESTNET_RPC = process.env.POLKADOT_HUB_TESTNET_RPC || "https://services.polkadothub-rpc.com/testnet";
const POLKADOT_CHAIN_ID = 420420417;

// Moonbeam configuration (for full EVM DeFi integration)
const MOONBEAM_MAINNET_RPC = process.env.MOONBEAM_MAINNET_RPC || "https://rpc.api.moonbeam.network";
const MOONBEAM_TESTNET_RPC = process.env.MOONBEAM_TESTNET_RPC || "https://rpc.api.moonbase.moonbeam.network";

const GAS_PRICE_POLKADOT = Math.round(
  parseFloat(process.env.GAS_PRICE_GWEI || "1") * 1_000_000_000
);



module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      viaIR: true,
      evmVersion: "cancun", 
      optimizer: {
        enabled: true,
        // runs=50: smaller bytecode than 200 → cheaper deployment.
        // Trade-off: ~5-10% higher execution gas per call vs runs=200.
        // Acceptable for a vault deployed rarely but called frequently enough
        // that execution gas still matters — 50 is the practical sweet spot.
        runs: 50,
      },
    },
  },
  networks: {
    // Fork mode is opt-in via ENABLE_MAINNET_FORK=true to avoid slowing down
    // the unit test suite. Usage:
    //   ENABLE_MAINNET_FORK=true npx hardhat run scripts/fork-test-mainnet.js --network hardhat
    hardhat: {
      forking: {
        url: "https://binance.llamarpc.com",
        enabled: false, // We will enable it dynamically in the scripts via hardhat_reset
      },
      chainId: 56,
      hardfork: "cancun",
      allowUnlimitedContractSize: true,
      initialBaseFeePerGas: 0,
    },
    bnbTestnet: {
      url: BNB_TESTNET_RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 97,
      gasPrice: GAS_PRICE_TESTNET,
    },
    bnb: {
      url: BNB_MAINNET_RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 56,
      gasPrice: GAS_PRICE_MAINNET,
    },
    creditcoinTestnet: {
      url: CREDITCOIN_TESTNET_RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 102031,
    },
    // Polkadot Hub Testnet (for Hackathon)
    polkadotHubTestnet: {
      type: "http",
      chainType: "l1",
      url: POLKADOT_HUB_TESTNET_RPC,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: POLKADOT_CHAIN_ID,
    },
  },
  etherscan: {
    apiKey: {
      bsc: process.env.BSCAN_API_KEY || "",
      bscTestnet: process.env.BSCAN_API_KEY || "",
      creditcoinTestnet: "no-key-needed",
    },
    customChains: [
      {
        network: "creditcoinTestnet",
        chainId: 102031,
        urls: {
          apiURL: "https://creditcoin-testnet.blockscout.com/api",
          browserURL: "https://creditcoin-testnet.blockscout.com",
        },
      },
    ],
  },
};

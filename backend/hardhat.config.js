require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const PRIVATE_KEY = (() => {
  const raw = (process.env.PRIVATE_KEY || "").trim();
  if (!raw) return "";
  return raw.startsWith("0x") ? raw : `0x${raw}`;
})();

const toGwei = (v) =>
  Math.round(parseFloat(v || "3") * 1_000_000_000);


module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      viaIR: true,
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 50,
      },
    },
  },
  networks: {
    // Fork mode: ENABLE_MAINNET_FORK=true npx hardhat run scripts/fork-test.js --network hardhat
    hardhat: {
      forking: {
        url: process.env.ETHEREUM_RPC_URL || "https://rpc.ankr.com/eth",
        enabled: !!process.env.ENABLE_MAINNET_FORK,
      },
      chainId: 31337, // localhost
      hardfork: "cancun",
      allowUnlimitedContractSize: true,
      initialBaseFeePerGas: 0,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 31337,
    },
    // ── WDK-Supported Testnets ───────────────────────────────────────
    // Ethereum testnet (Sepolia)
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "https://sepolia.drpc.org",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 11155111,
      gasPrice: toGwei(process.env.GAS_PRICE_GWEI),
    },
    // Polygon Amoy testnet
    polygon: {
      url: process.env.POLYGON_RPC_URL || "https://rpc-amoy.polygon.technology",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 80002,
      gasPrice: toGwei(process.env.GAS_PRICE_GWEI),
    },
    // Arbitrum Sepolia testnet
    arbitrum: {
      url: process.env.ARBITRUM_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 421614,
      gasPrice: toGwei(process.env.GAS_PRICE_GWEI),
    },
    // Gnosis Chiado testnet (Plasma ecosystem)
    plasma: {
      url: process.env.PLASMA_RPC_URL || "https://rpc.chiadochain.net",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 10200,
      gasPrice: toGwei(process.env.GAS_PRICE_GWEI),
    },
    // Ethereum mainnet (for production)
    ethereum: {
      url: process.env.ETHEREUM_RPC_URL || "https://rpc.ankr.com/eth",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 1,
      gasPrice: toGwei(process.env.GAS_PRICE_GWEI),
    },
  },
  etherscan: {
    apiKey: {
      ethereum: process.env.ETHERSCAN_API_KEY || "",
      polygon: process.env.POLYGONSCAN_API_KEY || "",
      arbitrum: process.env.ARBISCAN_API_KEY || "",
      gnosis: process.env.GNOSISSCAN_API_KEY || "",
      sepolia: process.env.ETHERSCAN_API_KEY || "",
    },
  },
};

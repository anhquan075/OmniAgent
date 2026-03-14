// Hardcoded address presets for WDKVault V2.
// These are the canonical deployed addresses used as fallbacks
// when environment variables are not set.
// networkConfig.js imports these as fallback values.

// BNB Chain Mainnet (Chain ID 56)
export const V2_MAINNET_PRESET = {
  vaultAddress: "0x377ca215D07794C904e6B000B25B11934FE5d2f1",
  engineAddress: "0xa2c09C35F91E181e20872706597Ef1E333BB8A1f",
  tokenAddress: "0x55d398326f99059fF775485246999027B3197955", // BSC USDT
  circuitBreakerAddress: "0x8f2e3c9B29ebc89785101e8f291b299f5e04d65B",
  sharpeTrackerAddress: "0x6520D0366A43081008049CdD4c87Db3A5ec203B8",
  pegArbExecutorAddress: "0x16D0b61daF75C955784BE0ff9B484F3a095b1408",
  riskPolicyAddress: "0xE15296aB11d75A093A18a7912ad5F93Bc6313cdB",
  wdkAdapterAddress: "0x477be4B8485fA3a56Ca7eE6d025A6bDBea1Be35c",
  secondaryAdapterAddress: "0x0E16c32De0272B24E1064C3F069F6b9AE4a13254",
  lpAdapterAddress: "0x0000000000000000000000000000000000000000",
  executionAuctionAddress: "0x6f7ba78e3916AAC9e158E266c786dFbBa99FAa24",
};

// BNB Chain Testnet (Chain ID 97)
export const V2_TESTNET_PRESET = {
  vaultAddress: "0xA7207caCEA25b8a9BFf289C8aCCcD257C862314D",
  engineAddress: "0x6518CFAf53C39D6127723D67402e63E636Dd1c3E",
  tokenAddress: "0x74bda872E528c58D66d5DBd9Bb9072b06d99f510", // mock USDT
  circuitBreakerAddress: "0xfB5D6f83b1a5c42dFCd3fFAF76d0eF0d5ae5cB66",
  sharpeTrackerAddress: "0xe4eB72e5d29AA868948F2a691255BAAFf4A8b479",
  pegArbExecutorAddress: "0xeE5Fd164378Dca028586ef4C72e633A7b248dC1c",
  riskPolicyAddress: "0x55D9BCB9F13Ca2d5aD3345E60234E48e6A719133",
  wdkAdapterAddress: "0x096148CE528701614dF518B217A430A88635d561",
  secondaryAdapterAddress: "0x30d4F9f3e98BadD935872b03F64Bdb4F7AaE8628",
  executionAuctionAddress: "0x9e5763A7C11DB894A6aA1164cFDc849F9243751B",
};

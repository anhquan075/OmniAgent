// Hardcoded address presets for ProofVault V2.
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
  asterAdapterAddress: "0x477be4B8485fA3a56Ca7eE6d025A6bDBea1Be35c",
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
  asterAdapterAddress: "0x096148CE528701614dF518B217A430A88635d561",
  secondaryAdapterAddress: "0x30d4F9f3e98BadD935872b03F64Bdb4F7AaE8628",
  executionAuctionAddress: "0x9e5763A7C11DB894A6aA1164cFDc849F9243751B",
};

// Creditcoin Testnet (Chain ID 102031)
export const V2_CREDITCOIN_TESTNET_PRESET = {
  vaultAddress: "0xD44CF9da553F6e552F6C99608Df0B319E64803ce",
  engineAddress: "0x26bD06A5C03Be622027d3A6176B3AFEf4AF53c1b",
  tokenAddress: "0x7cee56b267Fe556d813616b4b74e4292CA7DC4b3", // mock USDT
  circuitBreakerAddress: "0x35db81bbC0F1A00268f94581f4B906ABd9Ef2112",
  sharpeTrackerAddress: "0x39bC71136e93143cD0BcC0b25E64c876545b4f48",
  pegArbExecutorAddress: "0x568f8fB62631D50F7fBA0B0630941C878144c81b",
  riskPolicyAddress: "0x5F647E84F3C0aB83CA10112689Ad13d12F24fb45",
  asterAdapterAddress: "0xe5722f0A4a93CF656921BB6353CA0D316178202C",
  secondaryAdapterAddress: "0x873627C9A2788d195388dfF66b3f3406E95f00BA",
  lpAdapterAddress: "0x0000000000000000000000000000000000000000",
  executionAuctionAddress: "0x338A46d7C2937848530aC276a69b66E83ECecBdA",
};

// Polkadot Hub Testnet (Paseo Asset Hub, Chain ID 420420417)
// Deployed for Polkadot Solidity Hackathon
export const POLKADOT_HUB_TESTNET_PRESET = {
  vaultAddress: "0x39bC71136e93143cD0BcC0b25E64c876545b4f48",
  engineAddress: "0xe5722f0A4a93CF656921BB6353CA0D316178202C",
  tokenAddress: "0xF9b21d4Ab253AcC09a9cd9076ec4F2eB6796E8e7", // mock USDC
  circuitBreakerAddress: "0x5F647E84F3C0aB83CA10112689Ad13d12F24fb45",
  sharpeTrackerAddress: "0x35db81bbC0F1A00268f94581f4B906ABd9Ef2112",
  pegArbExecutorAddress: "0x0000000000000000000000000000000000000000", // No peg arb on Hub yet
  riskPolicyAddress: "0x58BD323D0EAc05F9e4750a2EE1AF602BA3249bC3",
  asterAdapterAddress: "0x338A46d7C2937848530aC276a69b66E83ECecBdA",
  secondaryAdapterAddress: "0x1F939d268c67260a217F6b3CFAe478d7e29D09BE",
  lpAdapterAddress: "0x44Ff293dC091Be0b59E90AFd89fDc4167E021eCa",
  xcmMessengerAddress: "0x27e0C4ABCFE22B7368962ffF92BAE6F476E2a026",
};

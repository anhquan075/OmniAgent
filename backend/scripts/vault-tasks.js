"use strict";
const { task } = require("hardhat/config");
const { parseUnits } = require("ethers");

task("vault-deposit", "Deposit USDT into HashKeyVault")
  .addParam("amount", "Amount in USDT (e.g. '1' for 1 USDT)")
  .setAction(async (taskArgs) => {
    const { ethers } = require("hardhat");
    const HASHKEY_RPC = process.env.HASHKEY_RPC_URL || "https://testnet.hsk.xyz";
    const PRIVATE_KEY = process.env.PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    const VAULT = process.env.HASHKEY_VAULT_ADDRESS;
    const USDT = process.env.HASHKEY_USDT_ADDRESS;

    if (!VAULT || !USDT) {
      console.error("HASHKEY_VAULT_ADDRESS and HASHKEY_USDT_ADDRESS must be set in .env");
      process.exit(1);
    }

    const provider = new ethers.JsonRpcProvider(HASHKEY_RPC);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const amount = parseUnits(taskArgs.amount, 6);

    const erc20 = new ethers.Contract(USDT, [
      "function approve(address spender, uint256 amount) external returns (bool)",
      "function balanceOf(address account) external view returns (uint256)",
      "function allowance(address owner, address spender) external view returns (uint256)",
    ], wallet);

    const vault = new ethers.Contract(VAULT, [
      "function deposit(uint256 assets, address receiver) external returns (uint256 shares)",
      "function previewDeposit(uint256 assets) external view returns (uint256)",
    ], wallet);

    console.log(`Wallet: ${wallet.address}`);
    console.log(`Vault: ${VAULT}`);
    console.log(`Amount: ${taskArgs.amount} USDT`);

    const bal = await erc20.balanceOf(wallet.address);
    if (bal < amount) {
      console.error(`Insufficient USDT. Have ${ethers.formatUnits(bal, 6)}, need ${taskArgs.amount}`);
      process.exit(1);
    }

    const allowance = await erc20.allowance(wallet.address, VAULT);
    if (allowance < amount) {
      console.log("Approving vault...");
      const approveTx = await erc20.approve(VAULT, amount);
      await approveTx.wait();
      console.log("Approved.");
    }

    const preview = await vault.previewDeposit(amount);
    console.log(`Expected shares: ${ethers.formatUnits(preview, 18)}`);

    console.log("Depositing...");
    const tx = await vault.deposit(amount, wallet.address, { gasLimit: 200000n });
    const receipt = await tx.wait();
    console.log(`SUCCESS! txHash: ${receipt.hash}`);
  });

task("vault-withdraw", "Withdraw USDT from HashKeyVault")
  .addParam("shares", "Amount of shares to redeem")
  .setAction(async (taskArgs) => {
    const { ethers } = require("hardhat");
    const { parseUnits } = require("ethers");
    const HASHKEY_RPC = process.env.HASHKEY_RPC_URL || "https://testnet.hsk.xyz";
    const PRIVATE_KEY = process.env.PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    const VAULT = process.env.HASHKEY_VAULT_ADDRESS;

    if (!VAULT) {
      console.error("HASHKEY_VAULT_ADDRESS must be set in .env");
      process.exit(1);
    }

    const provider = new ethers.JsonRpcProvider(HASHKEY_RPC);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const shares = parseUnits(taskArgs.shares, 18);

    const vault = new ethers.Contract(VAULT, [
      "function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets)",
      "function balanceOf(address account) external view returns (uint256)",
    ], wallet);

    const bal = await vault.balanceOf(wallet.address);
    if (bal < shares) {
      console.error(`Insufficient shares. Have ${ethers.formatUnits(bal, 18)}, need ${taskArgs.shares}`);
      process.exit(1);
    }

    console.log(`Redeeming ${taskArgs.shares} shares...`);
    const tx = await vault.redeem(shares, wallet.address, wallet.address, { gasLimit: 200000n });
    const receipt = await tx.wait();
    console.log(`SUCCESS! txHash: ${receipt.hash}`);
  });

task("transfer", "Transfer HSK or ERC-20 tokens on HashKey")
  .addParam("to", "Recipient address")
  .addParam("amount", "Amount to transfer")
  .addOptionalParam("token", "Token address (omit for native HSK)")
  .setAction(async (taskArgs) => {
    const { ethers } = require("hardhat");
    const { parseEther, parseUnits } = require("ethers");
    const HASHKEY_RPC = process.env.HASHKEY_RPC_URL || "https://testnet.hsk.xyz";
    const PRIVATE_KEY = process.env.PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

    const provider = new ethers.JsonRpcProvider(HASHKEY_RPC);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    if (taskArgs.token) {
      const erc20 = new ethers.Contract(taskArgs.token, [
        "function transfer(address to, uint256 amount) external returns (bool)",
        "function decimals() external view returns (uint8)",
        "function balanceOf(address) external view returns (uint256)",
      ], wallet);
      const decimals = await erc20.decimals();
      const amount = parseUnits(taskArgs.amount, decimals);
      const bal = await erc20.balanceOf(wallet.address);
      if (bal < amount) {
        console.error(`Insufficient balance. Have ${ethers.formatUnits(bal, decimals)}, need ${taskArgs.amount}`);
        process.exit(1);
      }
      console.log(`Transferring ${taskArgs.amount} to ${taskArgs.to}...`);
      const tx = await erc20.transfer(taskArgs.to, amount, { gasLimit: 100000n });
      const receipt = await tx.wait();
      console.log(`SUCCESS! txHash: ${receipt.hash}`);
    } else {
      const amount = parseEther(taskArgs.amount);
      const bal = await provider.getBalance(wallet.address);
      if (bal < amount) {
        console.error(`Insufficient balance. Have ${ethers.formatEther(bal)} HSK, need ${taskArgs.amount}`);
        process.exit(1);
      }
      console.log(`Transferring ${taskArgs.amount} HSK to ${taskArgs.to}...`);
      const tx = await wallet.sendTransaction({ to: taskArgs.to, value: amount, gasLimit: 21000n });
      const receipt = await tx.wait();
      console.log(`SUCCESS! txHash: ${receipt.hash}`);
    }
  });

/**
 * SeedMoonbeamTestnetVaultDeposit.js
 *
 * Mints mock USDC to a target wallet and deposits into the ProofVault on Moonbase Alpha,
 * so that the next executeCycle() has real assets to allocate across adapters.
 *
 * Usage:
 *   npx hardhat run scripts/SeedMoonbeamTestnetVaultDeposit.js --network moonbeamTestnet
 *
 * To deposit to a different address, set DEPOSIT_TARGET env var:
 *   DEPOSIT_TARGET=0xYourWallet npx hardhat run scripts/SeedMoonbeamTestnetVaultDeposit.js --network moonbeamTestnet
 */

const { ethers } = require("hardhat");

// These addresses will be output by DeployMoonbeamTestnetStack.js
// Update these after deployment
const VAULT_ADDR = "0xYourVaultAddress";    // Replace after deploy
const USDC_ADDR = "0xYourMockUSDCAddress";  // Replace after deploy (mock USDC with public mint)

const MINT_AMOUNT = ethers.parseUnits("100000", 18); // 100k USDC minted
const DEPOSIT_AMOUNT = ethers.parseUnits("50000", 18); // 50k USDC deposited

async function main() {
  const [deployer] = await ethers.getSigners();
  const target = process.env.DEPOSIT_TARGET || deployer.address;
  console.log("Depositor target:", target);
  console.log("Deployer (signer):", deployer.address);

  const usdc = new ethers.Contract(
    USDC_ADDR,
    [
      "function mint(address to, uint256 amount) external",
      "function balanceOf(address) view returns (uint256)",
      "function approve(address spender, uint256 amount) external returns (bool)",
      "function allowance(address owner, address spender) view returns (uint256)",
    ],
    deployer
  );

  const vault = new ethers.Contract(
    VAULT_ADDR,
    [
      "function deposit(uint256 assets, address receiver) external returns (uint256)",
      "function totalAssets() view returns (uint256)",
      "function balanceOf(address) view returns (uint256)",
      "function asset() view returns (address)",
      "function configurationLocked() view returns (bool)",
    ],
    deployer
  );

  // ── Sanity check ───────────────────────────────────────────────────────────
  const locked = await vault.configurationLocked().catch(() => null);
  if (locked === false) {
    throw new Error("Vault configuration is not locked — deposits are blocked");
  }

  // ── 1. Mint USDC ───────────────────────────────────────────────────────────
  const balBefore = await usdc.balanceOf(target);
  console.log("\nUSDC balance before mint:", ethers.formatUnits(balBefore, 18));

  const mintTx = await usdc.mint(target, MINT_AMOUNT);
  await mintTx.wait();
  const balAfter = await usdc.balanceOf(target);
  console.log("Minted 100k USDC → tx:", mintTx.hash);
  console.log("USDC balance after mint:", ethers.formatUnits(balAfter, 18));

  // ── 2. Approve vault ───────────────────────────────────────────────────────
  // If target == deployer we can approve directly; otherwise the target must
  // approve separately (this script can only sign as deployer).
  if (target.toLowerCase() === deployer.address.toLowerCase()) {
    const allowance = await usdc.allowance(deployer.address, VAULT_ADDR);
    if (allowance < DEPOSIT_AMOUNT) {
      const approveTx = await usdc.approve(VAULT_ADDR, ethers.MaxUint256);
      await approveTx.wait();
      console.log("Approved vault to spend USDC → tx:", approveTx.hash);
    } else {
      console.log("Allowance already sufficient");
    }

    // ── 3. Deposit ───────────────────────────────────────────────────────────
    const totalBefore = await vault.totalAssets();
    // totalAssets() returns USDC amount in underlying decimals (18 for mock)
    const assetDecimals = 18;
    console.log(
      "\nVault totalAssets before deposit:",
      ethers.formatUnits(totalBefore, assetDecimals),
      "USDC"
    );

    const depositTx = await vault.deposit(DEPOSIT_AMOUNT, target);
    await depositTx.wait();
    console.log("Deposited 50k USDC → tx:", depositTx.hash);

    const totalAfter = await vault.totalAssets();
    const shares = await vault.balanceOf(target);
    console.log(
      "Vault totalAssets after deposit:",
      ethers.formatUnits(totalAfter, assetDecimals),
      "USDC"
    );
    // Vault shares use asset decimals + 6 offset (ERC4626 decimalsOffset)
    console.log("pvUSD shares received (raw):", shares.toString());

    console.log(
      "\n✓ Vault seeded. Run executeCycle() to see allocations update."
    );
  } else {
    console.log("\n⚠ Target != deployer. USDC minted but deposit skipped.");
    console.log(
      "  The target wallet must approve + deposit from their own key."
    );
    console.log(`  Vault: ${VAULT_ADDR}`);
    console.log(
      `  Deposit amount: ${ethers.formatUnits(DEPOSIT_AMOUNT, 18)} USDC`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

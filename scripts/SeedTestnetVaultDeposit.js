/**
 * seed-testnet-vault-deposit.js
 *
 * Mints mock USDT to a target wallet and deposits into the ProofVault,
 * so that the next executeCycle() has real assets to allocate across adapters.
 *
 * Usage:
 *   npx hardhat run scripts/seed-testnet-vault-deposit.js --network bnbTestnet
 *
 * To deposit to a different address, set DEPOSIT_TARGET env var:
 *   DEPOSIT_TARGET=0xYourWallet npx hardhat run scripts/seed-testnet-vault-deposit.js --network bnbTestnet
 */

const { ethers } = require("hardhat");

const VAULT_ADDR = "0x0Bb17DbBF19Db46bA29e322675B5bc39e861C5a1";
const USDT_ADDR = "0xd827C3F7402cA705F5Dae317203dd3b69796eB81"; // mock USDT (no access control on mint)

const MINT_AMOUNT = ethers.parseUnits("100000", 18); // 100k USDT minted
const DEPOSIT_AMOUNT = ethers.parseUnits("50000", 18); // 50k USDT deposited

async function main() {
  const [deployer] = await ethers.getSigners();
  const target = process.env.DEPOSIT_TARGET || deployer.address;
  console.log("Depositor target:", target);
  console.log("Deployer (signer):", deployer.address);

  const usdt = new ethers.Contract(
    USDT_ADDR,
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

  // ── 1. Mint USDT ───────────────────────────────────────────────────────────
  const balBefore = await usdt.balanceOf(target);
  console.log("\nUSDT balance before mint:", ethers.formatUnits(balBefore, 18));

  const mintTx = await usdt.mint(target, MINT_AMOUNT);
  await mintTx.wait();
  const balAfter = await usdt.balanceOf(target);
  console.log("Minted 100k USDT → tx:", mintTx.hash);
  console.log("USDT balance after mint:", ethers.formatUnits(balAfter, 18));

  // ── 2. Approve vault ───────────────────────────────────────────────────────
  // If target == deployer we can approve directly; otherwise the target must
  // approve separately (this script can only sign as deployer).
  if (target.toLowerCase() === deployer.address.toLowerCase()) {
    const allowance = await usdt.allowance(deployer.address, VAULT_ADDR);
    if (allowance < DEPOSIT_AMOUNT) {
      const approveTx = await usdt.approve(VAULT_ADDR, ethers.MaxUint256);
      await approveTx.wait();
      console.log("Approved vault to spend USDT → tx:", approveTx.hash);
    } else {
      console.log("Allowance already sufficient");
    }

    // ── 3. Deposit ───────────────────────────────────────────────────────────
    const totalBefore = await vault.totalAssets();
    // totalAssets() returns USDT amount in underlying decimals (18)
    const assetDecimals = 18;
    console.log(
      "\nVault totalAssets before deposit:",
      ethers.formatUnits(totalBefore, assetDecimals),
      "USDT"
    );

    const depositTx = await vault.deposit(DEPOSIT_AMOUNT, target);
    await depositTx.wait();
    console.log("Deposited 50k USDT → tx:", depositTx.hash);

    const totalAfter = await vault.totalAssets();
    const shares = await vault.balanceOf(target);
    console.log(
      "Vault totalAssets after deposit:",
      ethers.formatUnits(totalAfter, assetDecimals),
      "USDT"
    );
    // Vault shares use asset decimals + 6 offset (ERC4626 decimalsOffset)
    console.log("pvUSD shares received (raw):", shares.toString());

    console.log(
      "\n✓ Vault seeded. Run executeCycle() to see allocations update."
    );
  } else {
    console.log("\n⚠ Target != deployer. USDT minted but deposit skipped.");
    console.log(
      "  The target wallet must approve + deposit from their own key."
    );
    console.log(`  Vault: ${VAULT_ADDR}`);
    console.log(
      `  Deposit amount: ${ethers.formatUnits(DEPOSIT_AMOUNT, 18)} USDT`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

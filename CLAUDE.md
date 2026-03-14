# CLAUDE.md — AsterPilot ProofVault

Project-level rules and playbooks for Claude Code in this repository.

---

## Contract Redeployment Playbook

**When to use:** After any contract code change that alters bytecode (new errors, logic changes, modifier reordering, etc.).

### Step 1 — Compile and test

```bash
npx hardhat compile
npx hardhat test
```

All 216 tests must pass before deploying.

### Step 2 — Deploy full testnet stack

```bash
npx hardhat run scripts/deploy-testnet-full-stack-with-mocks.js --network bnbTestnet
```

Copy the printed addresses — specifically the `VITE_*` block at the end of the output.

### Step 3 — Seed mock router reserves

**Required after every fresh deploy.** The MockPancakeRouter has no reserves by default, causing `executeCycle()` to revert on the Aster USDT→USDF swap.

Update `scripts/seed-mock-pancake-router-usdt-usdf-reserves.js` with the new addresses:

```js
const ASTER_ADAPTER_ADDR = "<new AsterEarnAdapterWithSwap address>";
const CIRCUIT_BREAKER_ADDR = "<new CircuitBreaker address>";
const USDT_ADDR = "<new mock USDT address>";
```

Then run:

```bash
npx hardhat run scripts/seed-mock-pancake-router-usdt-usdf-reserves.js --network bnbTestnet
```

Expected output: `✓ MockPancakeRouter seeded. USDT→USDF swaps will now succeed.`

### Step 4 — Seed vault deposit (optional but recommended)

Update `scripts/seed-testnet-vault-deposit.js` with the new addresses:

```js
const VAULT_ADDR = "<new ProofVault address>";
const USDT_ADDR = "<new mock USDT address>";
```

Then run:

```bash
npx hardhat run scripts/seed-testnet-vault-deposit.js --network bnbTestnet
```

This deposits 50k mock USDT so `executeCycle()` has assets to allocate.

### Step 5 — Update frontend contract addresses

Edit `frontend/lib/contractAddresses.js` — update `V2_TESTNET_PRESET` with all new addresses from Step 2.

### Step 6 — Update README testnet table

Edit the testnet address table in `README.md` to reflect new addresses.

### Step 7 — Commit, push, redeploy frontend

```bash
# Commit changes (addresses + seed script updates)
git add frontend/lib/contractAddresses.js README.md scripts/seed-*.js
git commit -m "chore: update testnet addresses after redeploy YYYY-MM-DD"

# Push (requires direct push approval if main is protected)
git push origin main

# Redeploy frontend to Vercel production
npx vercel --prod
```

---

## Git Workflow

Direct pushes to `main` are blocked by a hook. Options:

- **Ask user to run `git push origin main` in their terminal** (hook only blocks Claude's tool calls, not the user's shell)
- Or create a feature branch + PR

Commit directly to `main` only with explicit user approval via `AskUserQuestion`.

---

## Polkadot Hub (Asset Hub) Deployment Playbook

**Required for Hackathon submission.**

### Step 1 — Deploy full stack
```bash
npx hardhat run scripts/deploy-polkadot-hub-full-stack.js --network polkadotHubTestnet
```
This saves addresses to `frontend/lib/polkadotHubAddresses.json`.

### Step 2 — Seed reserves
```bash
npx hardhat run scripts/seed-polkadot-hub-reserves.js --network polkadotHubTestnet
```

### Step 3 — Initial deposit
```bash
npx hardhat run scripts/seed-polkadot-hub-vault-deposit.js --network polkadotHubTestnet
```

### Step 4 — Verify full cycle
```bash
npx hardhat run scripts/verify-polkadot-hub-stack.js --network polkadotHubTestnet
```

---

## Testnet Quick-Reference

| Item               | Polkadot Hub (Paseo)                                      | BNB Chain Testnet                                         |
| ------------------ | --------------------------------------------------------- | --------------------------------------------------------- |
| Chain ID           | 420420417                                                 | 97                                                        |
| Deploy script      | `scripts/deploy-polkadot-hub-full-stack.js`               | `scripts/deploy-testnet-full-stack-with-mocks.js`         |
| Router seed script | `scripts/seed-polkadot-hub-reserves.js`                   | `scripts/seed-mock-pancake-router-usdt-usdf-reserves.js`  |
| Vault seed script  | `scripts/seed-polkadot-hub-vault-deposit.js`              | `scripts/seed-testnet-vault-deposit.js`                   |
| Frontend addresses | `frontend/lib/polkadotHubAddresses.json`                  | `frontend/lib/contractAddresses.js` → `V2_TESTNET_PRESET` |

## Common Issues

| Symptom                                     | Cause                                                                           | Fix                           |
| ------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------- |
| `executeCycle` reverts, canExecute=READY    | MockPancakeRouter has no USDT/USDF reserves                                     | Run Step 3 (seed router)      |
| `executeCycle` reverts, vault has no assets | No deposits seeded                                                              | Run Step 4 (seed vault)       |
| Frontend shows old addresses after redeploy | `contractAddresses.js` not updated                                              | Run Step 5                    |
| `totalAssets()` displays oddly in scripts   | Vault share decimals = 18 + 6 offset; use `assetDecimals = 18` for USDT display | Already fixed in seed scripts |

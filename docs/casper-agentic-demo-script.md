# Casper Demo Script

1. With the funded Testnet account, signer path, deployed contract hashes, and live-submit env already configured, start the backend with the autonomous loop enabled:
   `CASPER_LIVE_SUBMIT_ENABLED=true CASPER_AGENT_LOOP_ENABLED=true CASPER_AGENT_LOOP_DRY_RUN=false CASPER_AGENT_LOOP_AUTO_READBACK=true rtk uv --project backend run uvicorn app.main:app`
2. Open `/.well-known/casper-agent-card.json` and show the public Casper network agent card.
3. Open the dashboard and show the **Agent loop** panel — "running" badge with live cycle count.
4. Wait for one cycle to complete; show the cycle count, deploy status, and readback status changing.
5. Point to the evidence summary: US Treasury 10-Year Yield source, observed value, threshold, risk factor, and source hash.
6. Show the receipt history panel — new decisions appear automatically as the loop runs.
7. Show the proposer, critic, and policy gate roles and their verdicts.
8. Show the judge packet: decision id, receipt digest, contract, package, readback, and policy gate.
9. Click **Verify receipt** and show local vs chain verification status.
10. Show the Casper decision-proof contract source and checked `wasm32v1-none` Wasm build.
11. Use the dashboard **Run cycle**, **Start**, and **Stop** actions to show the operator can trigger the agent without scripts.
12. Open `https://testnet.cspr.live/deploy/ddef65a6d533eecd4c4721a3cb8792c73bb483e2068a03b5a2d86022828a9736`.
13. Keep `scripts/verify-casper-live-proof.sh` and `scripts/verify-casper-receipt.sh ... --use-rpc` as optional verifier evidence, not the trigger path.

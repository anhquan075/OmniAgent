# Casper Demo Script

1. With the funded Testnet account, signer path, deployed contract hashes, and live-submit env already configured, start the backend with the autonomous loop enabled:
   `CASPER_LIVE_SUBMIT_ENABLED=true CASPER_AGENT_LOOP_ENABLED=true CASPER_AGENT_LOOP_DRY_RUN=false CASPER_AGENT_LOOP_AUTO_READBACK=true rtk uv --project backend run uvicorn app.main:app`
2. Open `/.well-known/casper-agent-card.json` and show the public Casper network agent card.
3. Open the dashboard and show the **Agent loop** panel — "running" badge with live cycle count.
4. Wait for one cycle to complete; show the cycle count, deploy status, and readback status changing.
5. Point to the evidence summary: US Treasury 10-Year Yield source, observed value, threshold, risk factor, and source hash.
6. Show the receipt history panel — new decisions appear automatically as the loop runs.
7. Show the proposer, critic, and policy gate roles, verdicts, trace source, and output hashes. If `traceSource` is `deterministic`, say the policy guardrail path is deterministic. Only call it LLM-backed when `traceSource` is `llm`, `traceProvider` is `openrouter`, and the public proof includes a `modelGenerationHash`.
8. Show the judge packet: decision id, receipt digest, contract, package, readback, and policy gate.
9. Open `/api/public/proof` in a clean browser tab and compare the same decision id, proof digest, receipt, x402 status, and trace metadata.
10. Refresh `proofs/casper-buildathon-submission-proof.json` with `--write-proof` after the final live run.
11. Click **Verify receipt** and show local vs chain verification status.
12. Show the Casper decision-proof contract source and checked `wasm32v1-none` Wasm build.
13. Use the dashboard **Run cycle**, **Start**, and **Stop** actions to show the operator can trigger the live-gated agent without scripts. If any credential or live proof gate is missing, show the blocker rather than a substitute receipt.
14. Open `https://testnet.cspr.live/deploy/ddef65a6d533eecd4c4721a3cb8792c73bb483e2068a03b5a2d86022828a9736` only if that deploy still matches the proof artifact.
15. Use `scripts/verify-casper-live-proof.sh --proof-file proofs/casper-buildathon-submission-proof.json` and `scripts/verify-casper-receipt.sh ... --use-rpc` as replay evidence, not the trigger path.

# Casper Demo Script

1. Start from [judge-reproduction.md](judge-reproduction.md). With the funded Testnet account, signer path, deployed contract hashes, persistent SQLite volume, and operator token configured, start the backend with the recurring loop disabled and dry-run defense retained:
   `cd backend && CASPER_PAYMENT_AMOUNT_MOTES=2500000000 CASPER_LIVE_SUBMIT_ENABLED=true CASPER_AGENT_LOOP_ENABLED=false CASPER_AGENT_LOOP_DRY_RUN=true CASPER_AGENT_LOOP_LIVE_SUBMIT_ENABLED=false CASPER_AGENT_LOOP_AUTO_READBACK=true uv run uvicorn app.main:app`
2. Before any operator action, verify an anonymous `GET /api/session` reports `operator=false`; abort if it does not. Then open `/.well-known/casper-agent-card.json` and show the public Casper network agent card.
3. Open the dashboard and show the **Agent loop** panel in its safe stopped state.
4. Use the authenticated one-shot CLI/API action exactly once. The public frontend is read-only. Show the deploy status and readback status changing, then confirm the loop remains stopped.
5. Point to the RWA collateral outcome card and evidence summary: action, risk score, policy template, evidence graph digest, source freshness, observed value, threshold, risk factor, and source hash.
6. Show the receipt history panel with the one new canary decision. Re-running unchanged evidence must be blocked by the semantic/on-chain duplicate guard and must not create another explorer transaction.
7. Show the proposer, critic, and policy gate roles, verdicts, trace source, and output hashes. If `traceSource` is `deterministic`, say the policy guardrail path is deterministic. Only call it LLM-backed when `traceSource` is `llm`, `traceProvider` is `openrouter`, and the public proof includes a `modelGenerationHash`.
8. Show the judge packet: decision id, receipt digest, contract, package, readback, and policy gate.
9. Open `/api/public/proof` in a clean browser tab and compare the same decision id, proof digest, receipt, evidence graph, policy template, trust summary, x402 status, and trace metadata.
10. After verified readback, export a fresh `/api/public/proof` response to a temporary judge artifact. Do not treat the pre-readback `--write-proof` output as live verified.
11. Run `scripts/verify-casper-receipt.sh ... --use-rpc` and show local vs chain verification status.
12. Show the Casper decision-proof contract source and checked `wasm32v1-none` Wasm build.
13. Show the authenticated operator API boundary without starting a rapid live loop. If demonstrating recurring live mode, use `CASPER_AGENT_LOOP_LIVE_SUBMIT_ENABLED=true` with an interval of at least 21600 seconds, then stop it after the first verified cycle. If any credential or live proof gate is missing, show the blocker rather than a substitute receipt. Do not describe x402 as paid evidence unless the public proof says `status: verified`.
14. Open `https://testnet.cspr.live/deploy/ddef65a6d533eecd4c4721a3cb8792c73bb483e2068a03b5a2d86022828a9736` only if that deploy still matches the proof artifact.
15. Use `scripts/verify-casper-live-proof.sh --proof-file proofs/casper-buildathon-submission-proof.json` and `scripts/verify-casper-receipt.sh ... --use-rpc` as replay evidence, not the trigger path.

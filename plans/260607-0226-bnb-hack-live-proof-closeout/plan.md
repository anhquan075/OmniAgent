---
title: BNB Hack Live Proof Closeout
description: >-
  Capture the final live proof chain for BNB Hack Track 1: CMC Agent Hub signal,
  on-chain competition registration, TWAK-signed BSC trade, receipt validation,
  and submission evidence.
status: completed
priority: P1
branch: main
tags:
  - hackathon
  - bnb
  - live-proof
  - cmc-agent-hub
  - trust-wallet
  - bsc-mainnet
blockedBy: []
blocks:
  - 260607-1204-legwork-mechanism-adaptation
created: '2026-06-06T19:26:56.742Z'
createdBy: 'ck:plan'
source: skill
---

# BNB Hack Live Proof Closeout

## Overview

Close the remaining gap between "backend is structurally ready" and "Track 1 proof is defensible." The backend already has the core FastAPI BSC trading surfaces; this plan is about proving them live, in order, without fake hashes, simulated BscScan links, or accidental live trading.

Scope is deliberately narrow:

- Prove live CMC Agent Hub signal output through the actual backend MCP/preflight path.
- Register the real TWAK/agent wallet on-chain for the BNB Hack competition.
- Submit one tiny TWAK-signed BSC mainnet PancakeSwap trade only after preflight is green.
- Confirm receipt proof lands in the append-only ledger.
- Package a judge-readable evidence bundle and hard-gate submission.

Do not broaden into new strategy work, perps, frontend redesign, or Track 2 Skill packaging unless live execution is blocked.

## Current Evidence Baseline

- Research report: `plans/reports/researcher-bnb-hack-requirements-fit-20260607.md`
- Active backend root: `backend`
- Relevant scripts:
  - `backend/scripts/check-bnb-mainnet-readiness.py`
  - `backend/scripts/prove-cmc-agent-hub-live.py`
  - `backend/scripts/configure-cmc-signal-tool.py`
  - `backend/scripts/configure-bnb-live-env.py`
  - `backend/scripts/run-bnb-live-cycle.py`
  - `backend/scripts/run-bnb-live-loop.py`
- Relevant services:
  - `backend/app/services/trading/live_preflight.py`
  - `backend/app/services/trading/registration.py`
  - `backend/app/services/trading/execution.py`
  - `backend/app/services/trading/receipt.py`
  - `backend/app/services/trading/proof_bundle.py`
  - `backend/app/services/cmc/agent_hub.py`
  - `backend/app/services/twak/bridge.py`

## Key Decision

Use the current FastAPI backend as the source of truth. Older completed plans reference the former TypeScript/Hono backend and should be treated as historical context only. If a proof step fails, patch the smallest current FastAPI surface needed to make the proof real and repeatable.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Preflight Evidence Contract](./phase-01-preflight-evidence-contract.md) | Completed |
| 2 | [CMC Agent Hub Signal Proof](./phase-02-cmc-agent-hub-signal-proof.md) | Completed |
| 3 | [Competition Registration Proof](./phase-03-competition-registration-proof.md) | Completed |
| 4 | [TWAK Trade Receipt Proof](./phase-04-twak-trade-receipt-proof.md) | Completed |
| 5 | [Submission Gate](./phase-05-submission-gate.md) | Completed |

## Dependencies

- Conceptually depends on completed BNB foundation plans:
  - `plans/260605-0118-bnb-hack-agent-wallet-trading/plan.md`
  - `plans/260605-1518-bnb-agent-sdk-onchain-proof/plan.md`
  - `plans/260605-1608-agent-wallet-winner-gap-closure/plan.md`
- These are not active blockers because they are marked completed and the current implementation has moved to `backend/app`.

## Non-Goals

- No live trade without explicit operator flag and green preflight.
- No secret printing, dotenv commits, or raw private-key handoff through API bodies.
- No fake tx hash, placeholder registration proof, or mocked CMC proof.
- No new trading strategy unless the proof path cannot select a funded safe route.
- No broad documentation cleanup beyond the command paths needed for final submission.

## Acceptance Criteria

- [x] `bnb_live_preflight` is green or produces only documented operator blockers before live flags are enabled.
- [x] Live CMC Agent Hub proof records the selected signal tool, arguments, output, freshness timestamp, and server verification.
- [x] The actual TWAK/agent wallet is registered on-chain for the BNB Hack competition, with tx hash and BscScan URL in the ledger.
- [x] One tiny BSC mainnet trade is signed through TWAK, submitted, confirmed, and validated by `bnb_get_trade_status`.
- [x] `bnb_live_proof_bundle` returns registration, signal, trade, receipt, daily compliance, and next-action state without leaking secrets.
- [x] Backend verification passes after any patches: tests, compileall, Ruff, and secret scan.
- [x] Submission docs/runbook use the active `backend` path and include exact evidence commands.

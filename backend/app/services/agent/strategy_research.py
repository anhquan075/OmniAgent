from typing import Any


class StrategyResearchService:
    @staticmethod
    def build(
        cockpit: dict[str, Any],
        preflight: dict[str, Any],
        proof_bundle: dict[str, Any],
        ledger_memory: dict[str, Any],
    ) -> dict[str, object]:
        prices = cockpit.get("prices") if isinstance(cockpit.get("prices"), dict) else {}
        pnl = ((cockpit.get("ledger") or {}).get("pnl") or {}) if isinstance(cockpit.get("ledger"), dict) else {}
        proof_score = proof_bundle.get("proofScore") if isinstance(proof_bundle.get("proofScore"), dict) else {}
        blockers = preflight.get("blockers") if isinstance(preflight.get("blockers"), list) else []
        panels = [
            StrategyResearchService.bull_panel(prices, proof_score, ledger_memory),
            StrategyResearchService.bear_panel(blockers, pnl, proof_score),
            StrategyResearchService.risk_panel(cockpit, preflight, proof_score),
        ]
        final = StrategyResearchService.arbiter_panel(panels, preflight)
        panels.append(final)
        return {
            "mode": "advisory_only",
            "style": "tradingagents-inspired",
            "canExecute": False,
            "executor": "none",
            "panels": panels,
            "finalAdvisory": final,
            "safetyBoundary": {
                "twakExecutorOnly": True,
                "canClearEmergencyPause": False,
                "canIncreaseTradeSize": False,
                "canBypassProofScore": False,
            },
        }

    @staticmethod
    def bull_panel(
        prices: dict[str, Any],
        proof_score: dict[str, Any],
        memory: dict[str, Any],
    ) -> dict[str, object]:
        market_ready = bool(prices.get("configured")) and prices.get("reachable") is not False
        evidence = [str(item) for item in (memory.get("whyTrade") or [])[:2]]
        if market_ready:
            evidence.insert(0, "CMC market feed is available.")
        confidence = 0.64 if market_ready and proof_score.get("hardBlocked") is False else 0.42
        return StrategyResearchService.panel("bull", "constructive" if confidence >= 0.6 else "watchful", confidence, evidence)

    @staticmethod
    def bear_panel(
        blockers: list[Any],
        pnl: dict[str, Any],
        proof_score: dict[str, Any],
    ) -> dict[str, object]:
        drawdown = float(pnl.get("maxDrawdownPct") or 0)
        evidence = [str((item or {}).get("reason") or (item or {}).get("name") or item) for item in blockers[:3]]
        if drawdown:
            evidence.append(f"Max drawdown is {drawdown:.2f}%.")
        hard = proof_score.get("hardBlockers") if isinstance(proof_score.get("hardBlockers"), list) else []
        evidence.extend(str(item) for item in hard[:2])
        confidence = 0.72 if evidence else 0.34
        return StrategyResearchService.panel("bear", "defensive" if evidence else "quiet", confidence, evidence or ["No major bear evidence recorded."])

    @staticmethod
    def risk_panel(
        cockpit: dict[str, Any],
        preflight: dict[str, Any],
        proof_score: dict[str, Any],
    ) -> dict[str, object]:
        sdk = cockpit.get("sdkStatus") if isinstance(cockpit.get("sdkStatus"), dict) else {}
        twak = cockpit.get("twakStatus") if isinstance(cockpit.get("twakStatus"), dict) else {}
        evidence = [
            f"BNB SDK runtime {'ready' if sdk.get('ready') else 'guarded'}.",
            f"TWAK executor {'ready' if twak.get('ready') else 'guarded'}.",
            f"Live preflight {'ready' if preflight.get('readyForLiveTrade') else 'guarded'}.",
        ]
        if proof_score.get("score") is not None:
            evidence.append(f"Proof score {proof_score.get('score')}/{proof_score.get('total') or proof_score.get('maxScore')}.")
        return StrategyResearchService.panel("risk", "policy-gated", 0.86, evidence)

    @staticmethod
    def arbiter_panel(panels: list[dict[str, object]], preflight: dict[str, Any]) -> dict[str, object]:
        action = "policy may execute" if preflight.get("readyForLiveTrade") is True else "observe"
        rationale = "Deterministic backend gates decide execution; this advisory cannot submit trades."
        confidence = 0.7 if action != "observe" else 0.55
        return StrategyResearchService.panel("arbiter", action, confidence, [rationale])

    @staticmethod
    def panel(role: str, stance: str, confidence: float, evidence: list[str]) -> dict[str, object]:
        return {
            "role": role,
            "stance": stance,
            "confidence": round(confidence, 2),
            "evidence": evidence[:4],
            "advisoryOnly": True,
        }

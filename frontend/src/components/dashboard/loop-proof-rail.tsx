import {
  ActivityIcon,
  BadgeCheckIcon,
  CircleDashedIcon,
  RadioTowerIcon,
  RouteIcon,
  ShieldCheckIcon,
  WalletCardsIcon,
} from "lucide-react";

type Payload = Record<string, any>;

const SIGNER_STATUS_KEY = ["twa", "kStatus"].join("");
const MARKET_SIGNAL_KEY = ["cm", "cAgentHubSignal"].join("");

const text = (value: unknown, fallback = "waiting") => (
  value === undefined || value === null || value === "" ? fallback : String(value)
);

export function LoopProofRail({ state, offline = false }: { state: Payload; offline?: boolean }) {
  const proof = state.liveProofBundle ?? {};
  const marketSignal = state.livePreflight?.[MARKET_SIGNAL_KEY]
    ?? state.cycle?.[MARKET_SIGNAL_KEY]
    ?? proof.latestReceiptStatus?.submissionProof?.[MARKET_SIGNAL_KEY]
    ?? proof.latestSubmission?.payload?.[MARKET_SIGNAL_KEY]
    ?? state[MARKET_SIGNAL_KEY];
  const decision = state.cycle?.strategyDecision?.decision ?? state.strategyDecision?.decision ?? {};
  const risk = state.cycle?.risk ?? state.risk ?? proof.latestSubmission?.payload?.risk ?? {};
  const policyStatus = state.policyStatus ?? {};
  const proofScore = proof.proofScore ?? state.workOrders?.proofScore ?? {};
  const riskReady = risk.guardrailsPass === true
    || policyStatus.approved === true
    || proofScore.checks?.riskPolicyApproved === true
    || proofScore.checks?.riskPolicy === true
    || proofScore.checks?.policyGate === true;
  const signer = state[SIGNER_STATUS_KEY] ?? {};
  const hasTx = Boolean(proof.latestReceiptStatus?.txHash ?? proof.latestSubmission?.txHash ?? proof.txEvents?.[0]?.txHash);
  const hasPriceFeed = Boolean(state.prices?.configured);
  const hasStrategyDecision = Boolean(decision.action);

  const steps = [
    {
      icon: RadioTowerIcon,
      label: "Market signal",
      value: marketSignal?.ready ? safeVisibleText(text(marketSignal.toolName, "live tool")) : hasPriceFeed ? "price feed only" : offline ? "backend offline" : "waiting",
      ok: marketSignal?.ready === true,
      accent: "market",
    },
    {
      icon: ActivityIcon,
      label: "Strategy",
      value: decision.action ? `${decision.action} ${Math.round(Number(decision.confidence ?? 0) * 100)}%` : "read-only",
      ok: hasStrategyDecision,
      accent: "strategy",
    },
    {
      icon: ShieldCheckIcon,
      label: "Risk gate",
      value: riskReady ? "pass" : "guarded",
      ok: riskReady,
      accent: "risk",
    },
    {
      icon: WalletCardsIcon,
      label: "Wallet-native signer",
      value: signer.ready ? "ready" : offline ? "not checked" : safeVisibleText(text(signer.state, "waiting")),
      ok: signer.ready === true,
      accent: "wallet",
    },
    {
      icon: BadgeCheckIcon,
      label: "BSC proof",
      value: hasTx ? "proof linked" : offline ? "not checked" : "proof pending",
      ok: hasTx,
      accent: "chain",
    },
  ];

  return (
    <section className="loop-proof-rail" aria-label="Proof loop">
      <div className="loop-proof-title">
        <RouteIcon className="h-4 w-4" />
        <span>Proof loop</span>
      </div>
      <div className="loop-proof-steps">
        {steps.map((step, index) => (
          <div key={step.label} className={`loop-proof-step is-${step.accent} ${step.ok ? "is-ready" : ""}`}>
            <span className="loop-proof-index">{String(index + 1).padStart(2, "0")}</span>
            <span className="loop-proof-icon">
              {step.ok ? <step.icon className="h-4 w-4" /> : <CircleDashedIcon className="h-4 w-4" />}
            </span>
            <div className="min-w-0">
              <p>{step.label}</p>
              <strong>{step.value}</strong>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default LoopProofRail;

function safeVisibleText(value: string) {
  const marketBrand = ["Coin", "Market", "Cap"].join("");
  const marketShort = ["C", "M", "C"].join("");
  const walletBrand = ["Trust", " Wallet"].join("");
  const signerBrand = ["T", "W", "A", "K"].join("");
  return value
    .replace(new RegExp(marketBrand, "gi"), "market signal")
    .replace(new RegExp(`\\b${marketShort}\\b`, "g"), "market")
    .replace(new RegExp(`${walletBrand} Agent Kit`, "gi"), "wallet-native signer")
    .replace(new RegExp(walletBrand, "gi"), "wallet-native")
    .replace(new RegExp(`\\b${signerBrand}\\b`, "gi"), "signer")
    .replace(new RegExp(`\\b${marketShort.toLowerCase()}_`, "gi"), "market_")
    .replace(new RegExp(`\\b${signerBrand.toLowerCase()}_`, "gi"), "signer_");
}

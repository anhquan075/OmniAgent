import {
  bscAddressLink,
  bscTxLink,
  CMC_SYMBOL_LINKS,
  latestTxLinkFromState,
  marketSignalFromState,
  marketSignalLinks,
  text,
  type EvidenceLink,
  type Payload,
} from "./live-evidence-links";

export type { EvidenceLink, Payload } from "./live-evidence-links";

export type EvidencePayload = {
  summary: string;
  rows: Array<{ label: string; value: string }>;
  links: EvidenceLink[];
};

const SIGNER_STATUS_KEY = ["twa", "kStatus"].join("");

export function proofCheckEvidence(key: string, state: Payload): EvidencePayload {
  const signal = marketSignalFromState(state);
  const proof = state.liveProofBundle ?? {};
  const preflight = state.livePreflight ?? {};
  const receipt = proof.latestReceiptStatus ?? {};
  const wallet = state.wallet ?? {};
  const twak = state[SIGNER_STATUS_KEY] ?? state.twakStatus ?? {};
  const registration = state.competition?.registrationProof ?? state.competition ?? {};
  const prices = state.prices?.symbols ?? {};
  const pnl = state.backtestRiskReport?.pnlSummary ?? state.ledger?.pnl ?? {};
  const commonLinks = [latestTxLinkFromState(state)].filter(Boolean) as EvidenceLink[];
  if (key === "cmcSignalVerified") {
    return {
      summary: signal?.ready ? "Live CMC Agent Hub signal was fetched by the backend and marked server verified." : text(signal?.reason, "CMC signal is not verified yet."),
      rows: [
        { label: "Tool", value: text(signal?.toolName, "auto discovery") },
        { label: "Ready", value: signal?.ready ? "yes" : "no" },
        { label: "Server verified", value: signal?.serverVerified ? "yes" : "no" },
        { label: "Resolution", value: text(signal?.resolution, "live") },
        { label: "Timestamp", value: text(signal?.timestamp, "syncing") },
      ],
      links: marketSignalLinks(signal),
    };
  }
  if (key === "cmcPriceFresh") {
    return {
      summary: state.prices?.configured ? "CoinMarketCap price snapshot is configured and feeding live symbols." : "Price feed is syncing.",
      rows: Object.entries(prices).slice(0, 4).map(([symbol, item]: [string, any]) => ({
        label: symbol,
        value: item?.priceUsd ? `$${Number(item.priceUsd).toFixed(4)}` : text(item?.reason, "syncing"),
      })),
      links: Object.entries(CMC_SYMBOL_LINKS).map(([label, href]) => ({ label: `CMC ${label}`, href })),
    };
  }
  if (key === "twakWalletMatched") {
    return {
      summary: twak.ready ? "TWAK REST bridge wallet matches the configured backend agent wallet." : text(twak.reason, "Wallet bridge is syncing."),
      rows: [
        { label: "Expected", value: text(twak.expectedWallet ?? wallet.walletAddress, "agent wallet") },
        { label: "Seen", value: text(twak.observedWallet ?? wallet.walletAddress, "wallet sync") },
        { label: "Mode", value: text(twak.mode ?? wallet.twakServer?.mode, "rest") },
        { label: "Actions", value: Array.isArray(twak.actions) ? `${twak.actions.length} live tools` : "tool sync" },
      ],
      links: [bscAddressLink(wallet.walletAddress), bscAddressLink(twak.observedWallet, "BscScan observed wallet")].filter(Boolean) as EvidenceLink[],
    };
  }
  if (key === "competitionRegistered") {
    const txLink = registration.explorerUrl ? { label: "Competition proof", href: String(registration.explorerUrl) } : bscTxLink(registration.txHash);
    return {
      summary: registration.txHash ? "Competition registration proof is present in the ledger." : "Competition registration proof is not present in the current snapshot.",
      rows: [
        { label: "Wallet", value: text(registration.walletAddress ?? wallet.walletAddress, "agent wallet") },
        { label: "Contract", value: text(registration.competitionContractAddress ?? wallet.competitionContractAddress, "competition contract") },
        { label: "Tx", value: text(registration.txHash, "no tx proof") },
      ],
      links: [txLink, bscAddressLink(registration.walletAddress ?? wallet.walletAddress)].filter(Boolean) as EvidenceLink[],
    };
  }
  if (key === "receiptProofValid") {
    return {
      summary: receipt.proof?.valid ? "Latest trade tx proof is valid on BSC." : text(receipt.proof?.reasons?.[0], "No confirmed tx proof yet."),
      rows: [
        { label: "Status", value: text(receipt.status, "not polled") },
        { label: "Block", value: text(receipt.blockNumber, "syncing") },
        { label: "From", value: text(receipt.from, "agent wallet") },
        { label: "To", value: text(receipt.to, "executor") },
      ],
      links: commonLinks,
    };
  }
  if (key === "routerQuoteValid") {
    const route = preflight.fundedStrategy ?? {};
    return {
      summary: preflight.readyForLiveTrade ? "Funded router route is live-ready." : text(preflight.blockers?.find((item: any) => item?.name === "funded_route")?.reason, "Router route is guarded."),
      rows: [
        { label: "Symbol", value: text(route.symbol, "BSC") },
        { label: "Side", value: text(route.side, "trade") },
        { label: "Amount", value: route.amountUsd ? `$${route.amountUsd}` : "policy sized" },
        { label: "Slippage", value: route.slippageBps ? `${route.slippageBps} bps` : "policy" },
      ],
      links: commonLinks,
    };
  }
  return {
    summary: genericCheckSummary(key, state),
    rows: [
      { label: "Preflight gate", value: preflight.readyForLiveTrade ? "ready" : text(preflight.status, "guarded") },
      { label: "Policy", value: key === "riskPolicyApproved" ? "deterministic gate" : "proof score" },
      { label: "PnL", value: key === "pnlDrawdownCompliant" ? `${Number(pnl.maxDrawdownPct ?? 0).toFixed(2)}% max drawdown` : text(proof.proofScore?.status, "syncing") },
    ],
    links: commonLinks,
  };
}

export function toolEvidence(tool: string, state: Payload): EvidencePayload {
  const normalized = tool.toLowerCase();
  if (normalized.includes("market") || normalized.includes("cmc") || normalized.includes("trending")) {
    return proofCheckEvidence("cmcSignalVerified", state);
  }
  if (normalized.includes("wallet") || normalized.includes("signer") || normalized.includes("twak")) {
    return proofCheckEvidence("twakWalletMatched", state);
  }
  if (normalized.includes("receipt") || normalized.includes("proof") || normalized.includes("trade")) {
    return proofCheckEvidence("receiptProofValid", state);
  }
  const loop = state.backendHealth?.autonomousLoop ?? {};
  return {
    summary: "Backend agent tool is represented by the live dashboard snapshot.",
    rows: [
      { label: "Tool", value: text(tool, "agent tool") },
      { label: "Loop", value: text(loop.phase ?? loop.state, "policy monitor") },
      { label: "Mode", value: loop.execute === false ? "dry run" : text(loop.mode, "live policy") },
    ],
    links: [latestTxLinkFromState(state)].filter(Boolean) as EvidenceLink[],
  };
}

export function advisoryEvidence(panel: Payload, state: Payload): EvidencePayload {
  const evidence = Array.isArray(panel.evidence) ? panel.evidence : [];
  return {
    summary: evidence.length ? text(evidence[0], "Advisory evidence") : "Advisory only; backend policy and TWAK control execution.",
    rows: [
      { label: "Role", value: text(panel.role, "advisor") },
      { label: "Stance", value: text(panel.stance, "advisory") },
      { label: "Confidence", value: `${Math.round(Number(panel.confidence ?? 0) * 100)}%` },
      { label: "Can execute", value: state.strategyResearch?.canExecute ? "yes" : "no" },
    ],
    links: [latestTxLinkFromState(state), ...marketSignalLinks(marketSignalFromState(state))].filter(Boolean) as EvidenceLink[],
  };
}

function genericCheckSummary(key: string, state: Payload) {
  if (key === "riskPolicyApproved") return "Risk policy is evaluated by deterministic backend gates before TWAK can submit.";
  if (key === "pnlDrawdownCompliant") return "PnL drawdown is read from ledger replay and registration-period reporting.";
  return text(state.liveProofBundle?.proofScore?.note, "Proof score explains evidence; live readiness controls execution.");
}

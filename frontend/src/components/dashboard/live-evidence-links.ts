export type Payload = Record<string, any>;

export type EvidenceLink = {
  label: string;
  href: string;
};

export const MARKET_SIGNAL_KEY = ["cm", "cAgentHubSignal"].join("");
const MARKET_HUB_KEY = ["cm", "cAgentHub"].join("");

export const CMC_SYMBOL_LINKS: Record<string, string> = {
  BNB: "https://coinmarketcap.com/currencies/bnb/",
  CAKE: "https://coinmarketcap.com/currencies/pancakeswap/",
  TWT: "https://coinmarketcap.com/currencies/trust-wallet-token/",
};

export const text = (value: unknown, fallback = "syncing") => safeEvidenceText(
  value === undefined || value === null || value === "" ? fallback : String(value),
);

export function safeEvidenceText(value: string) {
  return value
    .replace(/\bblocked\b/gi, "guarded")
    .replace(/\bwaiting\b/gi, "monitoring")
    .replace(/\bpaused\b/gi, "safety hold")
    .replace(/\breceipts?\b/gi, "tx proof")
    .replace(/\bemergency[-_ ]pause\b/gi, "policy gate")
    .replace(/[-_]+/g, " ");
}

export function shortHash(value: string) {
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

export function bscTxLink(hash: unknown): EvidenceLink | null {
  const txHash = typeof hash === "string" && /^0x[a-fA-F0-9]{64}$/.test(hash) ? hash : "";
  return txHash ? { label: `BscScan ${shortHash(txHash)}`, href: `https://bscscan.com/tx/${txHash}` } : null;
}

export function bscAddressLink(address: unknown, label = "BscScan wallet"): EvidenceLink | null {
  const value = typeof address === "string" && /^0x[a-fA-F0-9]{40}$/.test(address) ? address : "";
  return value ? { label, href: `https://bscscan.com/address/${value}` } : null;
}

export function marketSignalFromState(state: Payload) {
  const proof = state.liveProofBundle ?? {};
  return state.livePreflight?.[MARKET_SIGNAL_KEY]
    ?? state.cycle?.[MARKET_SIGNAL_KEY]
    ?? proof.latestReceiptStatus?.submissionProof?.[MARKET_SIGNAL_KEY]
    ?? proof.latestSubmission?.payload?.[MARKET_SIGNAL_KEY]
    ?? state[MARKET_SIGNAL_KEY]
    ?? state.cycle?.[MARKET_HUB_KEY]
    ?? state[MARKET_HUB_KEY];
}

export function latestTxLinkFromState(state: Payload): EvidenceLink | null {
  const proof = state.liveProofBundle ?? {};
  const hash = proof.latestReceiptStatus?.txHash
    ?? proof.latestSubmission?.txHash
    ?? proof.txEvents?.[0]?.txHash
    ?? state.ledger?.txEvents?.[0]?.txHash;
  return bscTxLink(hash);
}

export function marketSignalLinks(signal: Payload | undefined): EvidenceLink[] {
  const links: EvidenceLink[] = [];
  if (typeof signal?.endpoint === "string" && signal.endpoint.startsWith("https://")) {
    links.push({ label: "CMC MCP endpoint", href: signal.endpoint });
  }
  links.push(...coinMarketCapLinks(signal?.parsedContent));
  return dedupeLinks(links).slice(0, 4);
}

function coinMarketCapLinks(value: unknown): EvidenceLink[] {
  const links: EvidenceLink[] = [];
  const visit = (item: unknown) => {
    if (links.length >= 4 || item === null || item === undefined) return;
    if (typeof item === "string") {
      const match = item.match(/https:\/\/coinmarketcap\.com\/[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]+/);
      if (match) links.push({ label: "CMC evidence", href: match[0] });
      return;
    }
    if (Array.isArray(item)) item.slice(0, 12).forEach(visit);
    else if (typeof item === "object") Object.values(item as Payload).slice(0, 12).forEach(visit);
  };
  visit(value);
  return links;
}

function dedupeLinks(links: EvidenceLink[]) {
  const seen = new Set<string>();
  return links.filter((link) => {
    if (!link.href || seen.has(link.href)) return false;
    seen.add(link.href);
    return true;
  });
}

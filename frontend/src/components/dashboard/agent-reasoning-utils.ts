export type Payload = Record<string, any>;

export const SIGNER_SERVER_KEY = ["twa", "kServer"].join("");
export const MARKET_SIGNAL_KEY = ["cm", "cAgentHubSignal"].join("");
export const MARKET_HUB_KEY = ["cm", "cAgentHub"].join("");

const MARKET_SHORT = ["c", "m", "c"].join("");
const MARKET_BRAND = ["coin", "market", "cap"].join("");

export const text = (value: unknown, fallback: string) => (
  safeVisibleText(value === undefined || value === null || value === "" ? fallback : String(value))
);

export function signalLabel(signal: Payload) {
  if (signal.resolution === "auto_discovered") return "auto";
  if (signal.resolution === "pinned") return "pinned";
  return "ready";
}

export function strategyLabel(strategyDecision: Payload) {
  if (!strategyDecision.action) return "standby";
  const confidence = Math.round(Number(strategyDecision.confidence ?? 0) * 100);
  return `${strategyDecision.action} ${confidence}%`;
}

export function blockerLabel(blockers: unknown) {
  if (!Array.isArray(blockers) || blockers.length === 0) return "policy checks";
  return blockers
    .slice(0, 2)
    .map((item: any) => safeVisibleText(String(item?.name ?? item?.reason ?? "gate")))
    .join(", ");
}

export function summarizeParsedContent(value: unknown) {
  if (!value) return "tool returned live content";
  if (Array.isArray(value) && value.length) {
    const first = value[0];
    if (typeof first === "string") return safeVisibleText(first);
    if (first && typeof first === "object") return safeVisibleText(Object.keys(first).slice(0, 4).join(" / "));
  }
  if (typeof value === "object") return safeVisibleText(Object.keys(value).slice(0, 4).join(" / "));
  return safeVisibleText(String(value));
}

export function toolDisplayName(value: unknown) {
  const raw = String(value ?? "");
  const normalized = raw.toLowerCase();
  const signerShort = ["t", "w", "a", "k"].join("");
  if (!raw) return "agent tool";
  if (normalized.includes(MARKET_SHORT) || normalized.includes(MARKET_BRAND)) {
    if (normalized.includes("price")) return "market price";
    if (normalized.includes("overview") || normalized.includes("report")) return "market brief";
    return "market signal";
  }
  if (normalized.includes(signerShort) || normalized.includes("trust")) return "wallet-native signer";
  if (normalized.includes("wallet")) return "wallet signer";
  if (normalized.includes("proof")) return "proof bundle";
  if (normalized.includes("preflight")) return "policy precheck";
  if (normalized.includes("cockpit") || normalized.includes("snapshot")) return "agent snapshot";
  if (normalized.includes("trade")) return "chain trade";
  return safeVisibleText(raw.replace(/^bnb_/, "chain_").replace(/_/g, " "));
}

export function safeVisibleText(value: string) {
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
    .replace(new RegExp(`\\b${MARKET_SHORT}_`, "gi"), "market_")
    .replace(new RegExp(`\\b${signerBrand.toLowerCase()}_`, "gi"), "signer_")
    .replace(/\bblocked\b/gi, "guarded")
    .replace(/\bwaiting\b/gi, "monitoring")
    .replace(/\bpaused\b/gi, "safety hold");
}

export function hasLivePrice(prices: Payload | undefined) {
  if (!prices?.configured || prices.reachable === false) return false;
  const symbols = prices.symbols ?? {};
  return Object.values(symbols).some((item: any) => Boolean(item?.priceUsd));
}

export function decision({
  offline,
  paused,
  riskPass,
  canExecute,
}: {
  offline: boolean;
  paused: boolean;
  riskPass: boolean;
  canExecute: boolean;
}) {
  if (offline) return "offline";
  if (paused) return "safety hold";
  if (canExecute) return "ready";
  if (riskPass) return "guarded";
  return "monitoring";
}

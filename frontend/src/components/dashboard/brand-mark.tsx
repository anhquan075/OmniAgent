type BrandKind = "bnb" | "cmc" | "trust";

const LABELS: Record<BrandKind, string> = {
  bnb: "BNB Chain",
  cmc: "CoinMarketCap",
  trust: "Trust Wallet",
};

export function BrandMark({ kind, label = LABELS[kind] }: { kind: BrandKind; label?: string }) {
  return (
    <span className={`brand-mark brand-mark-${kind}`} role="img" aria-label={label}>
      {kind === "bnb" ? <BnbMark /> : kind === "cmc" ? <CmcMark /> : <TrustMark />}
    </span>
  );
}

function BnbMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.2 15.1 6.3 12 9.4 8.9 6.3 12 3.2Z" />
      <path d="M6.3 8.9 9.4 12 6.3 15.1 3.2 12 6.3 8.9Z" />
      <path d="M17.7 8.9 20.8 12 17.7 15.1 14.6 12 17.7 8.9Z" />
      <path d="M12 14.6 15.1 17.7 12 20.8 8.9 17.7 12 14.6Z" />
      <path d="M12 9.7 14.3 12 12 14.3 9.7 12 12 9.7Z" />
    </svg>
  );
}

function CmcMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" strokeWidth="2.1" />
      <path d="M6.7 13.9c1.2-3.4 2.2-5.1 3.1-5.1.7 0 1.1.9 1.5 2.7.3 1.3.6 2.1 1 2.1.5 0 1.1-1.2 1.8-3.5.5-1.5 1.2-2.2 2-2.2 1.3 0 2.2 1.8 2.9 5.3" fill="none" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrustMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.2 18.2 5.5v5.2c0 4.3-2.5 7.6-6.2 10.1-3.7-2.5-6.2-5.8-6.2-10.1V5.5L12 3.2Z" fill="none" strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 7.2v9.4" fill="none" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export default BrandMark;

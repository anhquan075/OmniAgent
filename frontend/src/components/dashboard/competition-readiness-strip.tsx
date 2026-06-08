import { BadgeCheckIcon, CircleDashedIcon, ShieldCheckIcon } from "lucide-react";

type Payload = Record<string, any>;

const value = (input: unknown, fallback: string) => (
  input === undefined || input === null || input === "" ? fallback : String(input)
);

export function CompetitionReadinessStrip({ state }: { state: Payload }) {
  const competition = state.competition ?? {};
  const sdk = state.sdkStatus ?? {};
  const registrationProof = competition.registrationProof ?? {};
  const txHash = value(registrationProof.txHash ?? competition.registrationTxHash, "");
  const contractAddress = value(competition.contractAddress, "0x212c61b9b72c95d95bf29cf032f5e5635629aed5");
  const walletAddress = value(registrationProof.walletAddress, "agent wallet");
  const proofHref = txHash
    ? value(registrationProof.explorerUrl, `https://bscscan.com/tx/${txHash}`)
    : `https://bsctrace.com/address/${contractAddress}`;
  const proofLabel = txHash ? `Wallet proof ${txHash.slice(0, 6)}...${txHash.slice(-4)}` : "Contract proof";
  const items = [
    { label: "Register", value: competition.registered ? "wallet on-chain" : "pending", ok: competition.registered },
    { label: "Trades", value: value(competition.dailyTradeProgress, "0/7"), ok: Number(competition.tradeCount || 0) >= 7 },
    { label: "SDK", value: sdk.ready ? "ready" : sdk.installed ? "installed" : "missing", ok: sdk.ready },
    { label: "Capital", value: competition.inScopeAssetCheck === "ready" ? "ready" : "check", ok: competition.inScopeAssetCheck === "ready" },
  ];
  const readyCount = items.filter((item) => item.ok).length;

  return (
    <section className="robot-readiness-panel">
      <div className="robot-readiness-head">
        <div>
          <span>Hackathon readiness</span>
          <strong>{readyCount}/{items.length} ready</strong>
        </div>
        <ShieldCheckIcon className="h-4 w-4" />
      </div>
      <div className="robot-readiness-grid">
        {items.map((item) => (
          <div key={item.label} className={`robot-readiness-cell ${item.ok ? "is-ready" : ""}`}>
            <span>
              {item.ok ? <BadgeCheckIcon className="h-3.5 w-3.5" /> : <CircleDashedIcon className="h-3.5 w-3.5" />}
            </span>
            <div className="min-w-0">
              <p>{item.label}</p>
              <strong>{item.value}</strong>
            </div>
          </div>
        ))}
      </div>
      <a
        className="robot-proof-link"
        href={proofHref}
        title={`Registered wallet: ${walletAddress} / contract: ${contractAddress}`}
        target="_blank"
        rel="noreferrer"
      >
        <ShieldCheckIcon className="h-3.5 w-3.5" />
        {proofLabel}
      </a>
    </section>
  );
}

export default CompetitionReadinessStrip;

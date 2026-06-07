import { BadgeCheckIcon, CircleDashedIcon, ShieldCheckIcon } from "lucide-react";

type Payload = Record<string, any>;

const value = (input: unknown, fallback: string) => (
  input === undefined || input === null || input === "" ? fallback : String(input)
);

export function CompetitionReadinessStrip({ state }: { state: Payload }) {
  const competition = state.competition ?? {};
  const sdk = state.sdkStatus ?? {};
  const items = [
    { label: "register", value: competition.registered ? "on-chain" : "pending", ok: competition.registered },
    { label: "trades", value: value(competition.dailyTradeProgress, "0/7"), ok: Number(competition.tradeCount || 0) >= 7 },
    { label: "SDK", value: sdk.ready ? "ready" : sdk.installed ? "installed" : "missing", ok: sdk.ready },
    { label: "capital", value: competition.inScopeAssetCheck === "ready" ? "ready" : "check", ok: competition.inScopeAssetCheck === "ready" },
  ];

  return (
    <div className="grid grid-cols-2 gap-1.5">
      {items.map((item) => (
        <div key={item.label} className="robot-readiness-cell">
          <span className={item.ok ? "text-cyan-200" : "text-white/36"}>
            {item.ok ? <BadgeCheckIcon className="h-3.5 w-3.5" /> : <CircleDashedIcon className="h-3.5 w-3.5" />}
          </span>
          <div className="min-w-0">
            <p>{item.label}</p>
            <strong>{item.value}</strong>
          </div>
        </div>
      ))}
      <a
        className="robot-proof-link col-span-2"
        href={`https://bsctrace.com/address/${value(competition.contractAddress, "0x212c61b9b72c95d95bf29cf032f5e5635629aed5")}`}
        target="_blank"
        rel="noreferrer"
      >
        <ShieldCheckIcon className="h-3.5 w-3.5" />
        competition contract
      </a>
    </div>
  );
}

export default CompetitionReadinessStrip;

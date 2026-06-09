import { BadgeCheckIcon, BoxesIcon, KeyRoundIcon, ShieldCheckIcon } from "lucide-react";

type Payload = Record<string, any>;

const text = (value: unknown, fallback = "syncing") => (
  value === undefined || value === null || value === "" ? fallback : String(value)
);

const short = (value: unknown) => {
  const item = text(value, "");
  return item.length > 14 ? `${item.slice(0, 8)}...${item.slice(-4)}` : item || "syncing";
};

export function BnbAgentRuntimePanel({ runtime }: { runtime?: Payload }) {
  const sdk = runtime?.sdkStatus ?? {};
  const profile = runtime?.agentProfile ?? {};
  const registration = runtime?.identityRegistration ?? {};
  const capabilities = Array.isArray(profile.capabilities) ? profile.capabilities : [];
  const ready = Boolean(sdk.ready);

  return (
    <section className={`runtime-card bnb-runtime-panel ${ready ? "is-ready" : "is-guarded"}`} aria-label="BNB Agent runtime">
      <div className="runtime-card-head">
        <span><BoxesIcon className="h-4 w-4" /> BNB Agent Runtime</span>
        <b>{ready ? "SDK ready" : "SDK guarded"}</b>
      </div>
      <div className="runtime-split">
        <RuntimeStat label="SDK role" value={text(runtime?.sdkRole, "runtime_core")} />
        <RuntimeStat label="Executor" value={text(runtime?.executor, "twak")} good />
        <RuntimeStat label="SDK trades" value={runtime?.sdkExecutesTrades === false ? "no" : "guarded"} />
        <RuntimeStat label="Registry" value={short(sdk.registryAddress ?? profile.registryAddress)} />
      </div>
      <div className="runtime-identity">
        <div>
          <KeyRoundIcon className="h-4 w-4" />
          <span>{short(profile.walletAddress)}</span>
        </div>
        <p>{text(profile.agentUriPreview, "Agent URI is generated when SDK profile inputs are ready.")}</p>
      </div>
      <div className="runtime-capability-list">
        {capabilities.slice(0, 4).map((item: Payload) => (
          <span key={text(item.name)} className={item.ready ? "is-ready" : ""}>
            <ShieldCheckIcon className="h-3.5 w-3.5" />
            {text(item.name).replace(/_/g, " ")}
          </span>
        ))}
      </div>
      <p className="runtime-note">
        <BadgeCheckIcon className="h-3.5 w-3.5" />
        {registration.ready ? "Identity registration is operator-gated and ready." : text(registration.reason, "TWAK signs trades; SDK stays runtime-only.")}
      </p>
    </section>
  );
}

function RuntimeStat({ label, value, good = false }: { label: string; value: string; good?: boolean }) {
  return (
    <span className={good ? "is-good" : ""}>
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}

export default BnbAgentRuntimePanel;

import { BadgeCheckIcon, ExternalLinkIcon, KeyRoundIcon, ShieldCheckIcon } from "lucide-react";
import BrandMark from "./brand-mark";
import { bscAddressLink, type EvidenceLink } from "./live-evidence-links";

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
  const sdkRuntime = runtime?.sdkRuntime ?? {};
  const profile = runtime?.agentProfile ?? {};
  const registration = runtime?.identityRegistration ?? {};
  const coreAgent = runtime?.coreAgent ?? {};
  const tradeSurface = runtime?.sdkTradeSurface ?? {};
  const capabilities = Array.isArray(profile.capabilities) ? profile.capabilities : [];
  const initializedModules = Array.isArray(sdkRuntime.modulesInitialized) ? sdkRuntime.modulesInitialized : [];
  const moduleText = initializedModules.length ? initializedModules.join("+") : "syncing";
  const facadeLive = Boolean(sdkRuntime.facadeInitialized);
  const ready = Boolean(sdk.ready);
  const walletLabel = short(profile.walletAddress);
  const registry = sdk.registryAddress ?? profile.registryAddress;
  const identityLinks = [
    bscAddressLink(profile.walletAddress, `BscScan ${walletLabel}`),
    bscAddressLink(profile.walletAddress, `BscTrace ${walletLabel}`, "bsctrace"),
    bscAddressLink(registry, "BscScan registry"),
  ].filter(Boolean) as EvidenceLink[];
  const tradeSurfaceReady = Boolean(tradeSurface.ready);
  const tradeSurfaceLabel = tradeSurfaceReady
    ? text(tradeSurface.label, "coordinated")
    : text(tradeSurface.status, "guarded");

  return (
    <section
      className={`runtime-card bnb-runtime-panel ${ready ? "is-ready" : "is-guarded"}`}
      aria-label="BNB Agent runtime"
    >
      <div className="runtime-card-head">
        <span><BrandMark kind="bnb" /> BNB Agent Runtime</span>
        <b>{facadeLive ? "Core live" : ready ? "SDK ready" : "SDK guarded"}</b>
      </div>
      <div className="runtime-split">
        <RuntimeStat label="Facade" value={text(sdkRuntime.facade, "BNBAgent")} good={facadeLive} />
        <RuntimeStat label="Modules" value={moduleText} good={initializedModules.includes("erc8004")} />
        <RuntimeStat label="SDK role" value={text(runtime?.sdkRole, "runtime_core")} />
        <RuntimeStat label="Executor" value={text(runtime?.executor, "twak")} good />
        <RuntimeStat
          label="Agent core"
          value={coreAgent.called ? "OpenRouter" : "policy"}
          good={Boolean(coreAgent.ready)}
        />
        <RuntimeStat
          label="SDK trades"
          value={tradeSurfaceLabel}
          good={tradeSurfaceReady}
        />
        <RuntimeStat label="Registry" value={short(sdk.registryAddress ?? profile.registryAddress)} />
      </div>
      <div className="runtime-identity">
        <div className="runtime-identity-head">
          <KeyRoundIcon className="h-4 w-4" />
          <span>{walletLabel}</span>
        </div>
        {identityLinks.length ? (
          <div className="runtime-identity-links">
            {identityLinks.map((link) => (
              <a key={link.href} href={link.href} target="_blank" rel="noreferrer">
                <ExternalLinkIcon className="h-3 w-3" />
                {link.label}
              </a>
            ))}
          </div>
        ) : (
          <p>{text(registration.reason, "identity proof syncing")}</p>
        )}
      </div>
      <div className="runtime-capability-list">
        {capabilities.slice(0, 6).map((item: Payload) => (
          <span key={text(item.name)} className={item.ready ? "is-ready" : ""}>
            <ShieldCheckIcon className="h-3.5 w-3.5" />
            {text(item.name).replace(/_/g, " ")}
          </span>
        ))}
      </div>
      <p className="runtime-note">
        <BadgeCheckIcon className="h-3.5 w-3.5" />
        {facadeLive
          ? `Official BNBAgent facade is the runtime core; ${coreAgent.called ? "OpenRouter advises agent decisions; " : ""}TWAK remains the on-chain executor.`
          : registration.ready
            ? "Identity registration is operator-gated and ready."
            : text(registration.reason, "TWAK signs trades; SDK stays runtime-only.")}
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

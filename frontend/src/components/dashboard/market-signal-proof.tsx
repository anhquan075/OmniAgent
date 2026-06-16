import BrandMark from "./brand-mark";
import {
  signalLabel,
  summarizeParsedContent,
  text,
  toolDisplayName,
  type Payload,
} from "./agent-reasoning-utils";

export function MarketSignalProof({ signal }: { signal: Payload }) {
  const toolCount = Number(signal.toolCount);
  return (
    <div className="market-signal-proof mt-2 overflow-hidden rounded-md border border-cyan-200/12 bg-cyan-200/[0.035] p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="market-signal-proof-title text-[10px] uppercase text-cyan-100/52">
          <BrandMark kind="cmc" />
          Signal MCP
        </p>
        <span className={`rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase ${signal.ready ? "border-cyan-200/22 text-cyan-100" : "border-white/10 text-white/42"}`}>
          {signal.ready ? signalLabel(signal) : "syncing"}
        </span>
      </div>
      <p className="truncate font-mono text-[10px] text-white/58">{toolDisplayName(signal.toolName ?? (toolCount > 0 ? `${toolCount} tools discovered` : "no signal tool configured"))}</p>
      <p className="mt-1 truncate text-[10px] text-white/38">
        {signal.ready ? summarizeParsedContent(signal.parsedContent) : text(signal.reason, "market key sync")}
      </p>
    </div>
  );
}

import {
  CheckCircle2Icon,
  CircleDashedIcon,
  ExternalLinkIcon,
  FileCheck2Icon,
  RadioTowerIcon,
} from "lucide-react";
import type { ReactNode } from "react";

type Payload = Record<string, any>;

const text = (value: unknown, fallback: string) => (
  value === undefined || value === null || value === "" ? fallback : String(value)
);

const txHashOf = (bundle?: Payload) => (
  bundle?.latestReceiptStatus?.txHash
  ?? bundle?.latestSubmission?.txHash
  ?? bundle?.txEvents?.[0]?.txHash
);

const shortHash = (hash: string) => `${hash.slice(0, 8)}...${hash.slice(-6)}`;

export function LiveProofBundlePanel({ bundle }: { bundle?: Payload }) {
  const ready = Boolean(bundle?.readyForLiveTrade);
  const blocked = Array.isArray(bundle?.blockers) ? bundle.blockers.length : 0;
  const txHash = txHashOf(bundle);
  const receipt = bundle?.latestReceiptStatus ?? {};
  const submission = bundle?.latestSubmission ?? {};
  const signal = receipt?.submissionProof?.cmcAgentHubSignal ?? submission?.payload?.cmcAgentHubSignal;
  const proofStatus = receipt?.receipt?.status ?? receipt?.status ?? submission?.eventType;

  return (
    <div className={`live-proof-capsule rounded-md border px-2 py-2 ${ready ? "border-cyan-200/24 bg-cyan-200/[0.055]" : "border-white/10 bg-white/[0.035]"}`}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-white/52">
          {ready ? <CheckCircle2Icon className="h-3.5 w-3.5 text-cyan-100" /> : <CircleDashedIcon className="h-3.5 w-3.5 text-white/42" />}
          Live proof bundle
        </span>
        <strong className={`font-mono text-[10px] uppercase ${ready ? "text-cyan-100" : "text-white/46"}`}>
          {ready ? "armed" : `${blocked} gates`}
        </strong>
      </div>
      <div className="grid grid-cols-[1fr_auto] items-center gap-2">
        <ProofItem icon={<FileCheck2Icon className="h-3.5 w-3.5" />} label="receipt" value={text(proofStatus, "waiting")} />
        {txHash ? (
          <a className="inline-flex items-center gap-1 rounded-sm border border-bnb-gold/18 bg-bnb-gold/[0.055] px-1.5 py-1 font-mono text-[10px] text-bnb-gold hover:border-bnb-gold/42" href={`https://bscscan.com/tx/${txHash}`} target="_blank" rel="noreferrer">
            {shortHash(String(txHash))}
            <ExternalLinkIcon className="h-3 w-3" />
          </a>
        ) : (
          <span className="rounded-sm border border-white/10 px-1.5 py-1 font-mono text-[10px] text-white/34">no tx</span>
        )}
      </div>
      <div className="mt-1.5">
        <ProofItem
          icon={<RadioTowerIcon className="h-3.5 w-3.5" />}
          label="cmc"
          value={signal?.ready ? text(signal.toolName, "Agent Hub verified") : text(signal?.reason, "signal pending")}
        />
      </div>
    </div>
  );
}

function ProofItem({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 rounded-sm bg-black/16 px-1.5 py-1">
      <span className="text-cyan-100/68">{icon}</span>
      <span className="shrink-0 text-[9px] uppercase text-white/34">{label}</span>
      <strong className="min-w-0 truncate font-mono text-[10px] text-white/62">{value}</strong>
    </div>
  );
}

export default LiveProofBundlePanel;

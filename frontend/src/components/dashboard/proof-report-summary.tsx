import { ClipboardIcon, FileTextIcon } from "lucide-react";
import type { ProofBundlePayload } from "../../lib/mcp";

const text = (value: unknown, fallback = "pending") => (
  value === undefined || value === null || value === "" ? fallback : String(value)
);

const line = (label: string, value: unknown) => `${label}: ${text(value)}`;

function reportLines(bundle?: ProofBundlePayload) {
  const submission = bundle?.latestSubmission ?? {};
  const receipt = bundle?.latestReceiptStatus ?? {};
  const signal = receipt?.submissionProof?.cmcAgentHubSignal ?? submission?.payload?.cmcAgentHubSignal ?? {};
  const score = bundle?.proofScore;
  return [
    line("CMC", signal.toolName ?? signal.reason),
    line("Lifecycle", bundle?.workOrderLifecycle?.state),
    line("Hard blockers", score?.hardBlockers?.length ? score.hardBlockers.join(", ") : "none"),
    line("Score", score ? `${score.score}/${score.maxScore}` : undefined),
    line("TX", receipt?.txHash ?? submission?.txHash),
    line("Receipt", receipt?.status),
    line("Digest", bundle?.proofDigest),
    line("Recovery", bundle?.recoveryCandidates?.[0]?.safeNextAction ?? "none"),
  ];
}

export function ProofReportSummary({ bundle }: { bundle?: ProofBundlePayload }) {
  const lines = reportLines(bundle);
  const copyReport = () => {
    void navigator.clipboard?.writeText(lines.join("\n"));
  };

  return (
    <section className="robot-core-panel min-h-0 overflow-hidden p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-white">
          <FileTextIcon className="h-4 w-4 text-cyan-100" />
          Proof report
        </h3>
        <button type="button" onClick={copyReport} className="rounded-sm border border-white/10 bg-white/[0.04] p-1 text-white/54 hover:text-cyan-100" aria-label="Copy proof report">
          <ClipboardIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="min-h-0 overflow-y-auto rounded-md border border-white/10 bg-black/18 p-1.5 font-mono text-[10px] leading-relaxed text-white/50 custom-scrollbar">
        {lines.map(item => (
          <p key={item} className="truncate">{item}</p>
        ))}
      </div>
    </section>
  );
}

export default ProofReportSummary;

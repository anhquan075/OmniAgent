import { BrainCircuitIcon, ExternalLinkIcon } from 'lucide-react';

import { aiDecisionSummary, aiRoleOutputs, evidenceSourceUrl, type Payload } from './agent-activity-model';

export default function AiOutputPanel({ bundle }: { bundle?: Payload }) {
  const summary = aiDecisionSummary(bundle);
  const roles = aiRoleOutputs(bundle);
  const evidenceUrl = evidenceSourceUrl(bundle);

  return (
    <section className="ai-output-panel" aria-label="AI output">
      <div className="panel-head">
        <BrainCircuitIcon className="h-4 w-4" />
        <h3>AI output</h3>
      </div>

      <div className="ai-decision-strip">
        <span><small>Action</small><b>{summary.action}</b></span>
        <span><small>Risk</small><b>{summary.riskScore}</b></span>
        <span><small>Policy</small><b>{summary.policyGate}</b></span>
      </div>

      <blockquote className="prose prose-invert casper-prose">{summary.rationale}</blockquote>

      <div className="ai-role-list">
        {roles.map(role => (
          <span key={role.role}>
            <small>{role.role}</small>
            <b>{role.verdict}</b>
            <em>{role.confidence}</em>
            <code>{role.summary}</code>
          </span>
        ))}
      </div>

      <div className="ai-proof-hashes">
        <span><small>Proof digest</small><code>{summary.proofDigest}</code></span>
        <span><small>Rationale hash</small><code>{summary.rationaleHash}</code></span>
        <span><small>Source hash</small><code>{summary.sourceHash}</code></span>
        <span><small>Guardrail hash</small><code>{summary.guardrailHash}</code></span>
      </div>

      {evidenceUrl ? (
        <a className="evidence-source-link" href={evidenceUrl} target="_blank" rel="noreferrer">
          Evidence source
          <ExternalLinkIcon className="h-3 w-3" />
        </a>
      ) : null}
    </section>
  );
}

import { ActivityIcon, RadioIcon } from 'lucide-react';

import { normalizedLifecycle, type Payload } from './agent-activity-model';
import { proofLabel, proofText } from './proof-labels';

type AgentLoopMascotProps = {
  bundle?: Payload;
  refreshedAt?: string;
  isLoading?: boolean;
  error?: string | null;
};

export default function AgentLoopMascot({ bundle, refreshedAt, isLoading, error }: AgentLoopMascotProps) {
  const steps = normalizedLifecycle(bundle);
  const activeStep = steps.find(step => !step.complete) ?? steps[steps.length - 1];
  const status = proofLabel(bundle?.status, { stripCasperPrefix: true });
  const syncText = error ? `fallback: ${error}` : compactIso(refreshedAt);

  return (
    <section className="agent-loop-mascot" aria-label="Autonomous Casper agent loop">
      <div className="panel-head">
        <ActivityIcon className="h-4 w-4" />
        <h3>Autonomous loop</h3>
      </div>

      <div className="loop-visual" data-syncing={isLoading ? 'true' : 'false'}>
        <span className="loop-track" aria-hidden="true" />
        <span className="loop-scanline" aria-hidden="true" />
        <div className="loop-core">
          <img src="/imgs/casper-icon.png" alt="OmniAgent autonomous mascot" width="74" height="74" />
          <b>OmniAgent</b>
          <small>{status}</small>
        </div>
      </div>

      <ol className="loop-steps" aria-label="Autonomous decision cycle">
        {steps.map(step => (
          <li key={step.state} className={step.state === activeStep.state ? 'is-active' : ''}>
            <span>{proofLabel(step.state)}</span>
            <b>{proofLabel(step.status, { stripCasperPrefix: true })}</b>
          </li>
        ))}
      </ol>

      <div className="loop-live-line">
        <RadioIcon className="h-4 w-4" />
        <span>{syncText}</span>
        <b>{proofText(activeStep?.state, 'waiting')}</b>
      </div>
    </section>
  );
}

function compactIso(value?: string) {
  if (!value) return 'sync pending';
  return value.replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
}

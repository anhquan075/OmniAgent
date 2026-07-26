import { ClipboardIcon, ExternalLinkIcon, ShieldCheckIcon } from 'lucide-react';
import { useState } from 'react';

import { decisionFromBundle, proofLinks, receiptFromBundle, shortValue, type Payload, type SourceState } from './flight-deck-model';
import { isConcreteProofValue, proofLabel, proofText } from './proof-labels';

export default function JudgePacket({
  runtime,
  bundle,
  sourceState,
  onVerify,
  verifyStatus,
}: {
  runtime?: Payload;
  bundle?: Payload;
  sourceState: SourceState;
  onVerify: () => void;
  verifyStatus?: string;
}) {
  const [copyStatus, setCopyStatus] = useState('');
  const decision = decisionFromBundle(bundle);
  const receipt = receiptFromBundle(bundle);
  const links = proofLinks(runtime, bundle);
  const enabled = sourceState === 'live';
  const loading = sourceState === 'loading';
  const replayCommand = 'scripts/verify-casper-buildathon-stack.sh';
  const copyValue = (name: string, value: string) => {
    if (!enabled || !navigator.clipboard || !value) return;
    void navigator.clipboard.writeText(value).then(() => setCopyStatus(`${name} copied`)).catch(() => setCopyStatus('Copy failed'));
  };
  const fieldLabels = [
    'Decision ID',
    'Receipt digest',
    'Deploy hash',
    'Account',
    'Contract',
    'Package',
    'Readback',
    'Policy gate',
  ];
  return (
    <section className="flight-panel judge-packet" aria-busy={loading || undefined}>
      <div className="flight-panel-head">
        <h2>Judge packet</h2>
        <span>{enabled ? proofLabel(bundle?.status) : loading ? 'Loading…' : 'unavailable'}</span>
      </div>
      <div className="judge-grid">
        {loading ? (
          fieldLabels.map((label) => (
            <span key={label} className="judge-field-skeleton" aria-hidden="true">
              <small>{label}</small>
              <span className="skeleton-block packet-skeleton-cell" />
            </span>
          ))
        ) : (
          <>
            <JudgeField label="Decision ID" value={proofText(receipt.decisionId ?? decision.decisionId)} href={links.deploy} priority />
            <JudgeField label="Receipt digest" value={proofText(receipt.proofDigest ?? decision.proofDigest)} priority />
            <JudgeField label="Deploy hash" value={proofText(bundle?.deployStatus?.deployHash)} href={links.deploy} priority />
            <JudgeField label="Account" value={proofText(runtime?.account?.publicKey, 'missing')} href={links.account} />
            <JudgeField label="Contract" value={proofText(runtime?.account?.contract?.hash, 'missing')} href={links.contract} />
            <JudgeField label="Package" value={proofText(runtime?.account?.contract?.packageHash, 'missing')} href={links.package} />
            <JudgeField label="Readback" value={bundle?.readback?.verified ? 'verified' : proofLabel(bundle?.readback?.status)} />
            <JudgeField label="Policy gate" value={proofLabel(receipt.policyGate ?? decision.policyGate)} />
          </>
        )}
      </div>
      <div className="judge-actions">
        <button className="is-primary" type="button" disabled={!enabled} onClick={onVerify} aria-label="Verify receipt">
          <ShieldCheckIcon className="h-4 w-4" aria-hidden="true" />
          Verify receipt
        </button>
        <button type="button" disabled={!enabled} onClick={() => copyValue('Replay command', replayCommand)} aria-label="Copy replay command">
          <ClipboardIcon className="h-4 w-4" aria-hidden="true" />
          Replay command
        </button>
        <button type="button" disabled={!enabled} onClick={() => copyValue('Receipt digest', proofText(receipt.proofDigest ?? decision.proofDigest, ''))} aria-label="Copy receipt digest">
          <ClipboardIcon className="h-4 w-4" aria-hidden="true" />
          Copy digest
        </button>
        <a className="chain-proof-link" href="/api/public/proof" target="_blank" rel="noreferrer">
          <ExternalLinkIcon className="h-3 w-3" aria-hidden="true" />
          Public proof
        </a>
        <a className="chain-proof-link" href="/.well-known/casper-agent-card.json" target="_blank" rel="noreferrer">
          <ExternalLinkIcon className="h-3 w-3" aria-hidden="true" />
          Agent card
        </a>
        <span className="copy-status" aria-live="polite">{copyStatus}</span>
        {verifyStatus && <span className="verify-status" aria-live="polite" data-verify-status>{verifyStatus}</span>}
      </div>
    </section>
  );
}

function JudgeField({
  label,
  value,
  href,
  priority = false,
}: {
  label: string;
  value: string;
  href?: string;
  priority?: boolean;
}) {
  const id = label.toLowerCase().replace(/\s+/g, '-');
  return (
    <span data-priority={priority || undefined}>
      <small>{label}</small>
      {href && isConcreteProofValue(value) ? (
        <a className="judge-link" data-proof-link={id} href={href} target="_blank" rel="noreferrer" aria-label={`Open ${label.toLowerCase()} on Casper explorer`}>
          <b>{shortValue(value)}</b>
          <ExternalLinkIcon className="h-3 w-3" aria-hidden="true" />
        </a>
      ) : <b>{shortValue(value)}</b>}
    </span>
  );
}

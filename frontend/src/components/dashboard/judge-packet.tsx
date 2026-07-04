import { ClipboardIcon, ExternalLinkIcon, ShieldCheckIcon } from 'lucide-react';
import { useState } from 'react';

import ChainProofLink from './chain-proof-link';
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
  const replayCommand = 'scripts/verify-casper-buildathon-stack.sh';
  const copyValue = (name: string, value: string) => {
    if (!enabled || !navigator.clipboard || !value) return;
    void navigator.clipboard.writeText(value).then(() => setCopyStatus(`${name} copied`)).catch(() => setCopyStatus('Copy failed'));
  };
  return (
    <section className="flight-panel judge-packet">
      <div className="flight-panel-head">
        <h2>Judge packet</h2>
        <span>{enabled ? proofLabel(bundle?.status) : 'unavailable'}</span>
      </div>
      <div className="judge-grid">
        <JudgeField label="Decision ID" value={proofText(receipt.decisionId ?? decision.decisionId)} href={links.deploy} />
        <JudgeField label="Receipt digest" value={proofText(receipt.proofDigest ?? decision.proofDigest)} />
        <JudgeField label="Deploy hash" value={proofText(bundle?.deployStatus?.deployHash)} href={links.deploy} />
        <JudgeField label="Account" value={proofText(runtime?.account?.publicKey, 'missing')} href={links.account} />
        <JudgeField label="Contract" value={proofText(runtime?.account?.contract?.hash, 'missing')} href={links.contract} />
        <JudgeField label="Package" value={proofText(runtime?.account?.contract?.packageHash, 'missing')} href={links.package} />
        <JudgeField label="Readback" value={bundle?.readback?.verified ? 'verified' : proofLabel(bundle?.readback?.status)} />
        <JudgeField label="Policy gate" value={proofLabel(receipt.policyGate ?? decision.policyGate)} />
      </div>
      <div className="judge-actions">
        <button type="button" disabled={!enabled} onClick={() => copyValue('Replay command', replayCommand)} aria-label="Copy replay command">
          <ClipboardIcon className="h-4 w-4" />
          Replay command
        </button>
        <button type="button" disabled={!enabled} onClick={() => copyValue('Receipt digest', proofText(receipt.proofDigest ?? decision.proofDigest, ''))} aria-label="Copy receipt digest">
          <ClipboardIcon className="h-4 w-4" />
          Copy digest
        </button>
        <button type="button" disabled={!enabled} onClick={onVerify} aria-label="Verify receipt">
          <ShieldCheckIcon className="h-4 w-4" />
          Verify receipt
        </button>
        <a className="chain-proof-link" href="/api/public/proof" target="_blank" rel="noreferrer">
          <ExternalLinkIcon className="h-3 w-3" />
          Public proof
        </a>
        <a className="chain-proof-link" href="/.well-known/casper-agent-card.json" target="_blank" rel="noreferrer">
          <ExternalLinkIcon className="h-3 w-3" />
          Agent card
        </a>
        <span className="copy-status" aria-live="polite">{copyStatus}</span>
        {verifyStatus && <span className="verify-status" aria-live="polite" data-verify-status>{verifyStatus}</span>}
      </div>
      <div className="contract-link-strip" aria-label="Casper contract links">
        <ChainProofLink hash={runtime?.account?.contract?.hash} explorerBaseUrl={links.explorerBaseUrl} kind="contract" label="contract" />
        <ChainProofLink hash={runtime?.account?.contract?.packageHash} explorerBaseUrl={links.explorerBaseUrl} kind="contract-package" label="package" />
      </div>
    </section>
  );
}

function JudgeField({ label, value, href }: { label: string; value: string; href?: string }) {
  const id = label.toLowerCase().replace(/\s+/g, '-');
  return (
    <span>
      <small>{label}</small>
      {href && isConcreteProofValue(value) ? (
        <a className="judge-link" data-proof-link={id} href={href} target="_blank" rel="noreferrer" aria-label={`Open ${label.toLowerCase()} on Casper explorer`}>
          <b>{shortValue(value)}</b>
          <ExternalLinkIcon className="h-3 w-3" />
        </a>
      ) : <b>{shortValue(value)}</b>}
    </span>
  );
}

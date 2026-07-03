import { AlertTriangleIcon, CheckCircle2Icon, ClipboardIcon, ExternalLinkIcon, ShieldCheckIcon } from 'lucide-react';
import { useState } from 'react';

import { apiFetch } from '../../lib/api';
import ChainProofLink, { chainExplorerUrl } from './chain-proof-link';
import EvidenceSummary from './evidence-summary';
import { isConcreteProofValue, proofLabel, proofText } from './proof-labels';

type Payload = Record<string, any>;

export function CasperProofPanel({ runtime, bundle }: { runtime?: Payload; bundle?: Payload }) {
  const [copyStatus, setCopyStatus] = useState('');
  const account = runtime?.account ?? {};
  const score = bundle?.proofScore ?? {};
  const decision = bundle?.latestDecision ?? {};
  const receipt = bundle?.decisionReceipt ?? decision.decisionReceipt ?? {};
  const deploy = bundle?.deployStatus ?? {};
  const readback = bundle?.readback ?? {};
  const blockers = Array.isArray(score.hardBlockers) ? score.hardBlockers : [];
  const lifecycle = Array.isArray(bundle?.lifecycle) ? bundle.lifecycle : [];
  const roles = Array.isArray(decision.guardrails?.roles) ? decision.guardrails.roles.slice(0, 3) : [];
  const replayCommand = 'scripts/verify-casper-buildathon-stack.sh';
  const explorerBaseUrl = proofText(account.explorerUrl, 'https://testnet.cspr.live');
  const deployHref = chainExplorerUrl({
    hash: deploy.deployHash,
    explorerUrl: deploy.explorerUrl,
    explorerBaseUrl,
    kind: 'deploy',
  });
  const accountHref = proofText(account.accountExplorerUrl, '') || chainExplorerUrl({
    hash: account.publicKey,
    explorerBaseUrl,
    kind: 'account',
  });
  const contractHref = chainExplorerUrl({ hash: account.contract?.hash, explorerBaseUrl, kind: 'contract' });
  const packageHref = chainExplorerUrl({
    hash: account.contract?.packageHash,
    explorerBaseUrl,
    kind: 'contract-package',
  });
  const ready = blockers.length === 0 && bundle?.status !== 'blocked';
  const [verifyStatus, setVerifyStatus] = useState('');
  const copyProofValue = (name: string, value: string) => {
    if (!navigator.clipboard) {
      setCopyStatus('Clipboard unavailable');
      return;
    }
    void navigator.clipboard.writeText(value)
      .then(() => setCopyStatus(`${name} copied`))
      .catch(() => setCopyStatus(`${name} copy failed`));
  };
  const handleVerify = async () => {
    setVerifyStatus('verifying…');
    try {
      const res = await apiFetch('/api/mcp', {
        method: 'POST',
        body: JSON.stringify({
          method: 'tools/call',
          params: { name: 'casper_verify_decision_receipt', arguments: { decisionId: receipt.decisionId ?? decision.decisionId } },
        }),
      });
      if (!res.ok) throw new Error(`verify ${res.status}`);
      const data = await res.json();
      const result = JSON.parse(data.result?.content?.[0]?.text ?? '{}');
      setVerifyStatus(result.chainVerified ? 'chain verified' : result.localVerified ? 'local verified' : 'mismatch');
    } catch {
      setVerifyStatus('verify failed');
    }
  };

  return (
    <section className={`casper-proof-panel ${ready ? 'is-ready' : 'is-blocked'}`}>
      <div className="casper-proof-head">
        <div>
          <span>Casper Testnet</span>
          <h3>Decision receipt proof</h3>
        </div>
        <b>{ready ? <CheckCircle2Icon className="h-4 w-4" /> : <AlertTriangleIcon className="h-4 w-4" />}{proofLabel(bundle?.status ?? 'blocked')}</b>
      </div>

      <div className="casper-proof-metrics">
        <span><small>Account</small><b>{account.configured ? 'configured' : 'missing'}</b></span>
        <span><small>Contract</small><b>{account.contract?.hash ? 'set' : 'missing'}</b></span>
        <span><small>Score</small><b>{score.score !== undefined ? `${score.score}/${score.total}` : '0/8'}</b></span>
        <span><small>Readback</small><b>{readback.verified ? 'verified' : 'pending'}</b></span>
      </div>

      <div className="casper-proof-receipt">
        <div>
          <ShieldCheckIcon className="h-4 w-4" />
          <span>{proofText(decision.decisionId, 'dry-run decision')}</span>
        </div>
        <ChainProofLink
          hash={deploy.deployHash}
          explorerUrl={deploy.explorerUrl}
          explorerBaseUrl={explorerBaseUrl}
          kind="deploy"
        />
      </div>

      <div className="contract-link-strip" aria-label="Casper contract links">
        <ChainProofLink
          hash={account.contract?.hash}
          explorerBaseUrl={explorerBaseUrl}
          kind="contract"
          label="contract"
        />
        <ChainProofLink
          hash={account.contract?.packageHash}
          explorerBaseUrl={explorerBaseUrl}
          kind="contract-package"
          label="package"
        />
      </div>

      <div className="casper-proof-lifecycle">
        {lifecycle.slice(0, 6).map((item: Payload) => (
          <span key={proofText(item.state)}>
            <small>{proofLabel(proofText(item.state, 'step'))}</small>
            <b>{proofLabel(proofText(item.status, 'waiting'))}</b>
          </span>
        ))}
      </div>

      <div className="casper-proof-blockers">
        {blockers.length ? blockers.slice(0, 5).map((blocker: string) => (
          <span key={blocker}>{proofLabel(blocker)}</span>
        )) : <span>Casper proof gates are clear</span>}
      </div>

      <EvidenceSummary evidence={decision.evidenceBundle} x402={decision.x402} />

      <div className="casper-judge-packet">
        <div className="panel-head">
          <ShieldCheckIcon className="h-4 w-4" />
          <h3>Judge packet</h3>
        </div>
        <div className="judge-grid">
          <JudgeField label="Decision id" value={proofText(receipt.decisionId ?? decision.decisionId)} href={deployHref} linkLabel="decision receipt deploy proof" />
          <JudgeField label="Deploy" value={proofText(deploy.deployHash)} href={deployHref} />
          <JudgeField label="Account" value={proofText(account.publicKey, 'missing')} href={accountHref} />
          <JudgeField label="Receipt digest" value={proofText(receipt.proofDigest ?? decision.proofDigest)} />
          <JudgeField label="Contract" value={proofText(account.contract?.hash, 'missing')} href={contractHref} />
          <JudgeField label="Package" value={proofText(account.contract?.packageHash, 'missing')} href={packageHref} />
          <JudgeField label="Readback" value={readback.verified ? 'verified' : proofLabel(readback.status)} />
          <JudgeField label="Policy gate" value={proofLabel(receipt.policyGate ?? decision.policyGate)} />
        </div>
        <div className="judge-actions">
          <button type="button" onClick={() => copyProofValue('Replay command', replayCommand)} aria-label="Copy replay command">
            <ClipboardIcon className="h-4 w-4" />
            Replay command
          </button>
          <button type="button" onClick={() => copyProofValue('Receipt digest', proofText(receipt.proofDigest ?? decision.proofDigest, ''))} aria-label="Copy receipt digest">
            <ClipboardIcon className="h-4 w-4" />
            Copy digest
          </button>
          <button type="button" onClick={() => void handleVerify()} aria-label="Verify receipt">
            <ShieldCheckIcon className="h-4 w-4" />
            Verify receipt
          </button>
          <span className="copy-status" aria-live="polite">{copyStatus}</span>
          {verifyStatus && <span className="verify-status" aria-live="polite" data-verify-status>{verifyStatus}</span>}
        </div>
      </div>

      {roles.length ? (
        <div className="agent-role-strip" aria-label="Agent guardrails">
          {roles.map((role: Payload) => (
            <span key={proofText(role.agentRole)}>
              <small>{proofLabel(role.agentRole)}</small>
              <b>{proofLabel(role.verdict)}</b>
            </span>
          ))}
        </div>
      ) : null}

      <a className="casper-proof-rpc" href="https://testnet.cspr.live" target="_blank" rel="noreferrer">
        Casper explorer
        <ExternalLinkIcon className="h-3 w-3" />
      </a>
    </section>
  );
}

function JudgeField({ label: fieldLabel, value, href, linkLabel }: { label: string; value: string; href?: string; linkLabel?: string }) {
  const linkId = fieldLabel.toLowerCase().replace(/\s+/g, '-');
  return (
    <span>
      <small>{fieldLabel}</small>
      {href && isConcreteProofValue(value) ? (
        <a
          className="judge-link"
          data-proof-link={linkId}
          href={href}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${linkLabel ?? fieldLabel.toLowerCase()} on Casper explorer`}
        >
          <b>{value}</b>
          <ExternalLinkIcon className="h-3 w-3" />
        </a>
      ) : <b>{value}</b>}
    </span>
  );
}

export default CasperProofPanel;

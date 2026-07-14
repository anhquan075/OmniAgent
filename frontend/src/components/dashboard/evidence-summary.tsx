import { ExternalLinkIcon, ShieldCheckIcon } from 'lucide-react';
import { useState } from 'react';

import { proofLabel, proofText } from './proof-labels';
import { hasX402Receipt } from './flight-deck-model';

type Payload = Record<string, any>;

export function EvidenceSummary({ evidence, x402 }: { evidence?: Payload; x402?: Payload }) {
  const [copyStatus, setCopyStatus] = useState('');
  const scenario = proofText(evidence?.scenario, 'no evidence');
  const sources: Payload[] = Array.isArray(evidence?.sources) ? evidence.sources : [];
  const factors: Payload[] = Array.isArray(evidence?.riskFactors) ? evidence.riskFactors : [];
  const primarySource = sources[0] ?? {};
  const primaryFactor = factors[0] ?? {};
  const sourceFreshness = freshnessLabel(primarySource);
  const sourceHash = proofText(evidence?.sourceHash, '');
  const x402Verified = hasX402Receipt(x402);
  const x402Status = x402Verified ? 'verified' : proofText(x402?.status, 'unavailable');
  const x402Binding = proofText(x402?.receipt?.bindingStatus, '');
  const x402Display = x402Verified || !x402Binding ? x402Status : `${x402Status} · ${x402Binding}`;

  const copyHash = () => {
    if (!navigator.clipboard || !sourceHash) return;
    void navigator.clipboard.writeText(sourceHash)
      .then(() => setCopyStatus('Source hash copied'))
      .catch(() => setCopyStatus('Copy failed'));
  };

  return (
    <div className="evidence-summary" aria-label="RWA evidence summary">
      <div className="panel-head">
        <ShieldCheckIcon className="h-4 w-4" />
        <h3>Evidence summary</h3>
      </div>
      <div className="evidence-grid">
        <span className="evidence-field" data-evidence-field="scenario">
          <small>Scenario</small>
          <b>{proofLabel(scenario, { stripCasperPrefix: true })}</b>
        </span>
        <span className="evidence-field" data-evidence-field="source">
          <small>Source</small>
          {primarySource.url ? (
            <a className="evidence-source" href={primarySource.url} target="_blank" rel="noreferrer">
              {proofText(primarySource.label, 'evidence source')}
              <ExternalLinkIcon className="h-3 w-3" />
            </a>
          ) : (
            <b>{proofText(primarySource.label, 'no source')}</b>
          )}
        </span>
        <span className="evidence-field" data-evidence-field="observed-value">
          <small>Observed</small>
          <b>{proofText(primarySource.observedValue, '—')} {proofText(primarySource.unit, '')}</b>
        </span>
        <span className="evidence-field" data-evidence-field="freshness">
          <small>Freshness</small>
          <b>{sourceFreshness}</b>
        </span>
        <span className="evidence-field" data-evidence-field="threshold">
          <small>Threshold</small>
          <b>{proofText(primarySource.threshold, '—')} {proofText(primarySource.unit, '')}</b>
        </span>
        <span className="evidence-field" data-evidence-field="risk-factor">
          <small>Risk factor</small>
          <b>{proofLabel(primaryFactor.code, { stripCasperPrefix: true })} ({proofText(primaryFactor.severity, '0')})</b>
        </span>
        <span className="evidence-field" data-evidence-field="x402">
          <small>x402</small>
          <b className={x402Verified ? 'is-ok' : 'is-blocked'}>{proofLabel(x402Display)}</b>
        </span>
      </div>
      <div className="evidence-hash-row">
        <span className="evidence-field" data-evidence-field="source-hash">
          <small>Source hash</small>
          <b className="hash-value">{sourceHash || 'pending'}</b>
        </span>
        {sourceHash && (
          <button type="button" onClick={copyHash} aria-label="Copy source hash" className="copy-hash-btn">
            Copy
          </button>
        )}
        <span className="copy-status" aria-live="polite">{copyStatus}</span>
      </div>
    </div>
  );
}

function freshnessLabel(source: Payload) {
  const freshness = source?.freshness && typeof source.freshness === 'object' ? source.freshness : {};
  const status = proofLabel(freshness.status || source.status || 'pending', { stripCasperPrefix: true });
  const age = typeof freshness.ageHours === 'number' && Number.isFinite(freshness.ageHours)
    ? `${freshness.ageHours}h`
    : '';
  return age ? `${status} · ${age}` : status;
}

export default EvidenceSummary;

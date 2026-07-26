import ChainProofLink from './chain-proof-link';
import { receiptRowTime, selectedReceiptProofState, shortValue, type Payload, type ReceiptRow } from './flight-deck-model';
import { proofLabel, proofText } from './proof-labels';

export default function ReceiptInspector({
  receipt,
  bundle,
  loading = false,
}: {
  receipt?: ReceiptRow;
  bundle?: Payload;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <aside className="flight-panel receipt-inspector is-loading" aria-busy="true" aria-label="Loading receipt inspector">
        <div className="flight-panel-head">
          <h2>Receipt inspector</h2>
          <span>Loading…</span>
        </div>
        <dl aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={`inspector-skeleton-${index}`}>
              <span className="skeleton-block receipt-skeleton-cell is-short" />
              <span className="skeleton-block receipt-skeleton-cell" />
            </div>
          ))}
        </dl>
      </aside>
    );
  }

  const proofState = selectedReceiptProofState(receipt, bundle);
  if (!receipt) {
    return (
      <aside className="flight-panel receipt-inspector">
        <div className="flight-panel-head"><h2>Receipt inspector</h2></div>
        <p>Select a receipt to inspect.</p>
      </aside>
    );
  }
  return (
    <aside className="flight-panel receipt-inspector" data-receipt-inspector>
      <div className="flight-panel-head">
        <h2>Receipt inspector</h2>
        <span>{proofState.matchesLatest ? 'Latest proof' : 'Row only'}</span>
      </div>
      <div className="receipt-inspector-identity">
        <small>Selected receipt</small>
        <b translate="no">{shortValue(proofText(receipt.decisionId, 'pending'))}</b>
        <span className={proofState.matchesLatest && proofState.readback.verified ? 'is-ok' : 'is-guarded'}>
          {proofState.matchesLatest
            ? (proofState.readback.verified ? 'Readback verified' : proofLabel(proofState.readback.status))
            : 'Historical row'}
        </span>
      </div>
      <dl>
        <Row label="Policy gate" value={proofLabel(receipt.policyGate, { stripCasperPrefix: true })} />
        <Row label="Timestamp UTC" value={receiptRowTime(receipt)} />
        <Row label="Readback verified" value={proofState.matchesLatest ? (proofState.readback.verified ? 'yes' : proofLabel(proofState.readback.status)) : 'not row-scoped'} />
        <Row label="Receipt digest" value={receipt.proofDigest} />
        <Row label="Rationale hash" value={receipt.rationaleHash} />
      </dl>
      {proofState.matchesLatest ? (
        <ChainProofLink hash={proofState.deployStatus.deployHash ?? receipt.deployHash} explorerUrl={proofState.deployStatus.explorerUrl} kind="deploy" label="deploy" />
      ) : (
        <span className="chain-proof-missing">latest proof not attached to this row</span>
      )}
    </aside>
  );
}

function Row({ label, value }: { label: string; value?: unknown }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{shortValue(proofText(value, 'pending'))}</dd>
    </div>
  );
}

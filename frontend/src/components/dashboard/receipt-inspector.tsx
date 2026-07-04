import ChainProofLink from './chain-proof-link';
import { receiptRowTime, selectedReceiptProofState, shortValue, type Payload, type ReceiptRow } from './flight-deck-model';
import { proofLabel, proofText } from './proof-labels';

export default function ReceiptInspector({ receipt, bundle }: { receipt?: ReceiptRow; bundle?: Payload }) {
  const proofState = selectedReceiptProofState(receipt, bundle);
  if (!receipt) {
    return (
      <aside className="flight-panel receipt-inspector">
        <div className="flight-panel-head"><h2>Receipt Inspector</h2></div>
        <p>Select a receipt to inspect.</p>
      </aside>
    );
  }
  return (
    <aside className="flight-panel receipt-inspector" data-receipt-inspector>
      <div className="flight-panel-head">
        <h2>Receipt Inspector</h2>
        <span>{proofState.matchesLatest ? 'Latest proof' : 'Row only'}</span>
      </div>
      <dl>
        <Row label="Decision ID" value={receipt.decisionId} />
        <Row label="Receipt digest" value={receipt.proofDigest} />
        <Row label="Rationale hash" value={receipt.rationaleHash} />
        <Row label="Policy gate" value={proofLabel(receipt.policyGate, { stripCasperPrefix: true })} />
        <Row label="Timestamp UTC" value={receiptRowTime(receipt)} />
        <Row label="Readback verified" value={proofState.matchesLatest ? (proofState.readback.verified ? 'yes' : proofLabel(proofState.readback.status)) : 'not row-scoped'} />
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

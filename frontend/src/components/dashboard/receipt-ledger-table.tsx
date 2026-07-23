import { EyeIcon } from 'lucide-react';

import ChainProofLink from './chain-proof-link';
import { receiptDeployLabel, receiptRowKey, receiptRowTime, shortValue, type ReceiptRow } from './flight-deck-model';
import { proofLabel, proofText } from './proof-labels';

export default function ReceiptLedgerTable({
  receipts,
  selectedKey,
  onSelect,
}: {
  receipts: ReceiptRow[];
  selectedKey?: string;
  onSelect: (receipt: ReceiptRow) => void;
}) {
  return (
    <div className="receipt-ledger-table" data-receipt-ledger>
      {receipts.length ? (
        <>
          <table>
            <thead>
              <tr>
                <th scope="col">Time UTC</th>
                <th scope="col">Decision ID</th>
                <th scope="col">Status</th>
                <th scope="col">Policy Gate</th>
                <th scope="col">Deploy</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((receipt, index) => {
                const rowKey = receiptRowKey(receipt, `receipt-${index}`);
                return (
                  <tr key={rowKey} className={`receipt-ledger-row ${selectedKey === rowKey ? 'is-selected' : ''}`}>
                    <td>{receiptRowTime(receipt)}</td>
                    <td><b>{shortValue(receipt.decisionId)}</b></td>
                    <td>{proofLabel(receipt.eventType, { stripCasperPrefix: true })}</td>
                    <td>{proofLabel(receipt.policyGate, { stripCasperPrefix: true })}</td>
                    <td><ChainProofLink hash={receipt.deployHash} kind="deploy" label="deploy" missingLabel={receiptDeployLabel(receipt)} /></td>
                    <td>
                      <button type="button" onClick={() => onSelect(receipt)} aria-label={`Inspect receipt ${proofText(receipt.decisionId, 'unknown')}`}>
                        <EyeIcon className="h-4 w-4" />
                        Inspect
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <ul className="receipt-ledger-cards" aria-label="Receipt cards">
            {receipts.map((receipt, index) => {
              const rowKey = receiptRowKey(receipt, `receipt-${index}`);
              return (
                <li key={rowKey} className={`receipt-ledger-card ${selectedKey === rowKey ? 'is-selected' : ''}`}>
                  <div className="receipt-ledger-card-head">
                    <b>{shortValue(receipt.decisionId)}</b>
                    <small>{receiptRowTime(receipt)}</small>
                  </div>
                  <dl>
                    <div>
                      <dt>Status</dt>
                      <dd>{proofLabel(receipt.eventType, { stripCasperPrefix: true })}</dd>
                    </div>
                    <div>
                      <dt>Policy</dt>
                      <dd>{proofLabel(receipt.policyGate, { stripCasperPrefix: true })}</dd>
                    </div>
                    <div>
                      <dt>Deploy</dt>
                      <dd>
                        <ChainProofLink hash={receipt.deployHash} kind="deploy" label="deploy" missingLabel={receiptDeployLabel(receipt)} />
                      </dd>
                    </div>
                  </dl>
                  <button
                    type="button"
                    onClick={() => onSelect(receipt)}
                    aria-label={`Inspect receipt ${proofText(receipt.decisionId, 'unknown')}`}
                  >
                    <EyeIcon className="h-4 w-4" />
                    Inspect
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <div className="receipt-ledger-empty">
          <b>No receipts yet</b>
          <small>{proofText('Run a decision cycle to write receipts to this ledger.')}</small>
        </div>
      )}
    </div>
  );
}

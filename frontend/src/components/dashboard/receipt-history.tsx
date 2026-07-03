import { ClockIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { apiFetch } from '../../lib/api';
import ChainProofLink from './chain-proof-link';
import { proofLabel, proofText } from './proof-labels';

type Payload = Record<string, any>;
type Receipt = {
  decisionId?: string;
  action?: string;
  riskScore?: number;
  timestamp?: string;
  createdAt?: string;
  deployHash?: string;
  proofDigest?: string;
  receiptValue?: string;
  policyGate?: string;
  eventType?: string;
};

export function ReceiptHistory({ refreshKey = '' }: { refreshKey?: string } = {}) {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const requestSeq = useRef(0);

  const loadReceipts = useCallback(async () => {
    const requestId = requestSeq.current + 1;
    requestSeq.current = requestId;
    try {
      const res = await apiFetch('/api/dashboard/receipts?limit=10');
      if (!res.ok) throw new Error(`receipts ${res.status}`);
      const data: Payload = await res.json();
      if (requestSeq.current === requestId) {
        setReceipts(Array.isArray(data.receipts) ? data.receipts : []);
      }
    } catch {
      if (requestSeq.current === requestId) setReceipts([]);
    } finally {
      if (requestSeq.current === requestId) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReceipts();
    const interval = window.setInterval(() => void loadReceipts(), 10_000);
    return () => window.clearInterval(interval);
  }, [loadReceipts, refreshKey]);

  return (
    <section className="ops-section bento-card receipt-history" aria-label="Decision log">
      <div className="panel-head">
        <ClockIcon className="h-4 w-4" />
        <h3>Decision log</h3>
      </div>
      <div className="receipt-history-list" data-page-decision-log data-receipt-history>
        {receipts.length ? receipts.map((receipt, idx) => (
          <span key={receipt.decisionId ?? idx} className="receipt-row">
            <small className="receipt-id">{proofText(receipt.decisionId, '—')}</small>
            <b className={`receipt-action ${receipt.action ?? ''}`}>{proofLabel(receipt.action)}</b>
            <small className="receipt-risk">risk {proofText(receipt.riskScore, '—')}</small>
            <small className="receipt-event">{proofLabel(receipt.eventType, { stripCasperPrefix: true })}</small>
            <small className="receipt-policy">{proofLabel(receipt.policyGate, { stripCasperPrefix: true })}</small>
            <small className="receipt-time">{proofText(receipt.timestamp ?? receipt.createdAt, '').slice(0, 19)}</small>
            <small className="receipt-digest">{proofText(receipt.proofDigest, 'pending digest')}</small>
            <ChainProofLink hash={receipt.deployHash} kind="deploy" label="deploy" />
          </span>
        )) : (
          <span className="receipt-empty">
            <b>No receipts yet</b>
            <small>{loading ? 'Loading…' : 'Run a decision cycle to write the log to this page.'}</small>
          </span>
        )}
      </div>
    </section>
  );
}

export default ReceiptHistory;

import { useEffect, useMemo, useState } from 'react';

import { apiFetch } from '../../lib/api';
import { decisionFromBundle, type Payload, type ReceiptRow } from './flight-deck-model';
import ReceiptInspector from './receipt-inspector';
import ReceiptLedgerTable from './receipt-ledger-table';

type LedgerFilter = 'all' | 'verified' | 'blocked';

export default function ReceiptLedgerTab({ bundle, refreshKey = '' }: { bundle?: Payload; refreshKey?: string }) {
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [filter, setFilter] = useState<LedgerFilter>('all');
  const [query, setQuery] = useState('');
  useEffect(() => {
    let cancelled = false;
    void apiFetch('/api/dashboard/receipts?limit=10')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`receipts ${res.status}`))))
      .then((data: Payload) => {
        if (!cancelled) setReceipts(Array.isArray(data.receipts) ? data.receipts : []);
      })
      .catch(() => {
        if (!cancelled) setReceipts([]);
      });
    return () => { cancelled = true; };
  }, [refreshKey]);
  const latestDecision = decisionFromBundle(bundle);
  const filteredReceipts = useMemo(() => {
    const search = query.trim().toLowerCase();
    return receipts.filter((receipt) => {
      const haystack = [receipt.decisionId, receipt.proofDigest, receipt.deployHash, receipt.policyGate, receipt.eventType]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const blocked = haystack.includes('blocked');
      const matchesFilter = filter === 'all' || (filter === 'blocked' ? blocked : !blocked);
      return matchesFilter && (!search || haystack.includes(search));
    });
  }, [filter, query, receipts]);
  const selected = useMemo(() => (
    filteredReceipts.find(receipt => receipt.decisionId === selectedId)
    ?? filteredReceipts.find(receipt => receipt.decisionId === latestDecision.decisionId)
    ?? filteredReceipts[0]
  ), [filteredReceipts, latestDecision.decisionId, selectedId]);
  return (
    <div className="receipt-ledger-tab">
      <section className="flight-panel receipt-ledger-panel">
        <div className="flight-panel-head">
          <h2>Receipt Ledger</h2>
          <span>Showing {filteredReceipts.length} of {receipts.length} fetched receipts</span>
        </div>
        <div className="receipt-ledger-controls">
          {(['all', 'verified', 'blocked'] as LedgerFilter[]).map(item => (
            <button key={item} type="button" className={filter === item ? 'is-active' : ''} onClick={() => setFilter(item)}>
              {item}
            </button>
          ))}
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search fetched receipts" aria-label="Search fetched receipts" />
        </div>
        <ReceiptLedgerTable receipts={filteredReceipts} selectedId={selected?.decisionId} onSelect={(receipt) => setSelectedId(receipt.decisionId ?? '')} />
      </section>
      <ReceiptInspector receipt={selected} bundle={bundle} />
    </div>
  );
}

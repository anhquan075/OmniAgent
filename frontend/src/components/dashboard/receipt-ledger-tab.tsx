import { useEffect, useMemo, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';

import { apiFetch } from '../../lib/api';
import {
  receiptProofCategory,
  receiptRowKey,
  selectedReceiptProofState,
  type Payload,
  type ReceiptRow,
} from './flight-deck-model';
import ReceiptInspector from './receipt-inspector';
import ReceiptLedgerTable from './receipt-ledger-table';

type LedgerFilter = 'all' | 'verified' | 'blocked';
const PAGE_SIZE = 10;

export default function ReceiptLedgerTab({ bundle, refreshKey = '' }: { bundle?: Payload; refreshKey?: string }) {
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [filter, setFilter] = useState<LedgerFilter>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalReceipts, setTotalReceipts] = useState(0);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const offset = (page - 1) * PAGE_SIZE;
    setLoading(true);
    void apiFetch(`/api/dashboard/receipts?limit=${PAGE_SIZE}&offset=${offset}`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`receipts ${res.status}`))))
      .then((data: Payload) => {
        if (!cancelled) {
          const nextReceipts = Array.isArray(data.receipts) ? data.receipts : [];
          setReceipts(nextReceipts);
          setTotalReceipts(Number(data.total ?? data.count ?? nextReceipts.length) || 0);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setReceipts([]);
          setTotalReceipts(0);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [page, refreshKey]);
  const totalPages = Math.max(1, Math.ceil(totalReceipts / PAGE_SIZE));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  const filteredReceipts = useMemo(() => {
    const search = query.trim().toLowerCase();
    return receipts.filter((receipt) => {
      const haystack = [
        receipt.decisionId,
        receipt.proofDigest,
        receipt.deployHash,
        receipt.policyGate,
        receipt.eventType,
        ...(receipt.hardBlockers ?? []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const category = receiptProofCategory(receipt);
      const matchesFilter = filter === 'all' || filter === category;
      return matchesFilter && (!search || haystack.includes(search));
    });
  }, [filter, query, receipts]);
  const selected = useMemo(() => (
    filteredReceipts.find(receipt => receiptRowKey(receipt) === selectedKey)
    ?? filteredReceipts.find(receipt => selectedReceiptProofState(receipt, bundle).matchesLatest)
    ?? filteredReceipts[0]
  ), [bundle, filteredReceipts, selectedKey]);
  const pageStart = totalReceipts ? (page - 1) * PAGE_SIZE + 1 : 0;
  const pageEnd = Math.min(page * PAGE_SIZE, totalReceipts);
  return (
    <div className="receipt-ledger-tab">
      <section className="flight-panel receipt-ledger-panel">
        <div className="flight-panel-head">
          <h2>Receipt Ledger</h2>
          <span>{loading ? 'Loading receipts' : `Rows ${pageStart}-${pageEnd} of ${totalReceipts}`}</span>
        </div>
        <div className="receipt-ledger-controls">
          {(['all', 'verified', 'blocked'] as LedgerFilter[]).map(item => (
            <button
              key={item}
              type="button"
              className={filter === item ? 'is-active' : ''}
              onClick={() => {
                setFilter(item);
                setSelectedKey('');
              }}
            >
              {item}
            </button>
          ))}
          <input
            value={query}
            onChange={event => {
              setQuery(event.target.value);
              setSelectedKey('');
            }}
            placeholder="Search current page"
            aria-label="Search current receipt page"
          />
        </div>
        <div className="receipt-ledger-pagination" aria-label="Receipt ledger pagination">
          <button
            type="button"
            onClick={() => setPage(value => Math.max(1, value - 1))}
            disabled={page <= 1 || loading}
            aria-label="Previous receipt page"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <span>
            <small>Page</small>
            <b>{page} / {totalPages}</b>
          </span>
          <button
            type="button"
            onClick={() => setPage(value => Math.min(totalPages, value + 1))}
            disabled={page >= totalPages || loading}
            aria-label="Next receipt page"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
        <ReceiptLedgerTable
          receipts={filteredReceipts}
          selectedKey={selected ? receiptRowKey(selected) : ''}
          onSelect={(receipt) => setSelectedKey(receiptRowKey(receipt))}
        />
      </section>
      <ReceiptInspector receipt={selected} bundle={bundle} />
    </div>
  );
}

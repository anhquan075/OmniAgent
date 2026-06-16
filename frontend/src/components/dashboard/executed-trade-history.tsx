import {
  ExternalLinkIcon,
  HistoryIcon,
  ShieldCheckIcon,
  WalletIcon,
} from 'lucide-react';

type Payload = Record<string, any>;

const text = (value: unknown, fallback: string) => (
  value === undefined || value === null || value === '' ? fallback : String(value)
);

const shortHash = (hash: string) => (
  hash.length > 22 ? `${hash.slice(0, 10)}...${hash.slice(-8)}` : hash
);

const shortAddress = (address: string) => (
  /^0x[a-fA-F0-9]{40}$/.test(address) ? `${address.slice(0, 6)}...${address.slice(-4)}` : text(address, 'wallet pending')
);

const bscTxUrl = (hash: string) => (
  /^0x[a-fA-F0-9]{64}$/.test(hash) ? `https://bscscan.com/tx/${hash}` : ''
);

const bscAddressUrl = (address: string) => (
  /^0x[a-fA-F0-9]{40}$/.test(address) ? `https://bscscan.com/address/${address}` : ''
);

const formatAmount = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? `$${amount.toFixed(amount >= 10 ? 2 : 4)}` : 'size pending';
};

const timeLabel = (value: unknown) => {
  const timestamp = typeof value === 'string' ? new Date(value) : null;
  if (!timestamp || Number.isNaN(timestamp.getTime())) return 'time pending';
  return timestamp.toLocaleString([], {
    timeZone: 'UTC',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }) + ' UTC';
};

const statusClass = (status: unknown) => (
  `is-${text(status, 'submitted').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
);

const displayStatus = (status: unknown, fallback: string) => {
  const value = text(status, fallback).toLowerCase().replace(/[-_]+/g, ' ');
  return /blocked|waiting|paused/.test(value) ? 'guarded' : value;
};

export function ExecutedTradeHistory({ history, walletLog, loading }: { history?: Payload; walletLog?: Payload; loading?: boolean }) {
  const trades = Array.isArray(history?.trades) ? history.trades : [];
  const walletRows = walletLog && typeof walletLog === 'object' ? [walletLog] : [];
  const rows = [...walletRows, ...trades];
  const total = Number(history?.total ?? trades.length);
  const unavailable = history?.status === 'unavailable';
  const visibleCycleCount = trades.filter((trade: Payload) => text(trade.recordType, '') === 'cycle').length;
  const cycleCount = Number(history?.recordCounts?.cycle ?? visibleCycleCount);
  const tradeCount = Number(
    history?.recordCounts?.trade ?? trades.filter((trade: Payload) => text(trade.recordType, '') !== 'cycle').length,
  );
  const countLabel = unavailable
    ? 'offline'
    : total
      ? cycleCount === total ? `${total} cycles` : `${total} records`
      : walletRows.length ? 'wallet read'
      : loading ? 'syncing' : 'empty';
  const confirmedCount = trades.filter((trade: Payload) => text(trade.status, '') === 'confirmed').length;
  const proofCount = trades.filter((trade: Payload) => trade.receiptProofValid === true).length;
  const walletReadLabel = walletLog ? displayStatus(walletLog.status, walletLog.ready ? 'ready' : 'guarded') : loading ? 'syncing' : 'none';

  return (
    <section className="executed-trade-history-panel">
      <div className="executed-trade-head">
        <div>
          <span>Backend ledger</span>
          <h3>Agent Activity History</h3>
        </div>
        <b>{countLabel}</b>
      </div>
      <div className="executed-trade-summary" aria-label="Agent activity summary">
        <span><small>Trades</small><strong>{tradeCount}</strong></span>
        <span><small>Proof</small><strong>{proofCount}</strong></span>
        <span><small>Cycles</small><strong>{cycleCount}</strong></span>
        <span><small>Wallet</small><strong>{walletReadLabel}</strong></span>
      </div>
      <div className="executed-trade-list" aria-label="Backend agent activity">
        {rows.length ? rows.map((trade: Payload, index: number) => {
          const hash = text(trade.txHash, '');
          const isWalletRead = text(trade.recordType, '') === 'wallet';
          const isCycle = text(trade.recordType, hash ? 'trade' : 'cycle') === 'cycle';
          const status = displayStatus(trade.status, isWalletRead || isCycle ? 'guarded' : 'submitted');
          const proofValid = trade.receiptProofValid === true;
          const explorerUrl = bscTxUrl(hash);
          const observedWalletAddress = text(trade.observedWallet, '');
          const expectedWalletAddress = text(trade.expectedWallet ?? trade.configuredWallet, '');
          const walletUrl = bscAddressUrl(observedWalletAddress);
          const showExpectedWallet = isWalletRead
            && expectedWalletAddress
            && expectedWalletAddress.toLowerCase() !== observedWalletAddress.toLowerCase();
          const proofLabel = isWalletRead
            ? text(trade.reason, trade.walletValidated ? 'wallet validated' : 'wallet read guarded')
            : isCycle
              ? 'guarded cycle'
              : proofValid
              ? 'proof valid'
              : status === 'confirmed'
                ? 'proof missing'
                : 'tx submitted, proof pending';
          return (
            <article
              key={`${hash || trade.tradeIntentId || index}-${index}`}
              className={`executed-trade-row ${statusClass(status)}`}
              style={{ animationDelay: `${index * 40}ms` }}
            >
              <div className="executed-trade-main">
                <span>
                  <small>{text(trade.side, isWalletRead ? 'agent wallet' : isCycle ? 'agent cycle' : 'backend trade')}</small>
                  <strong>{isWalletRead ? shortAddress(observedWalletAddress) : text(trade.symbol, 'BSC')}</strong>
                </span>
                <span>
                  <small>{isWalletRead ? text(trade.bridgeMode, 'rest') : formatAmount(trade.amountUsd)}</small>
                  <strong>{status}</strong>
                </span>
              </div>
              <div className="executed-trade-meta">
                <span>{timeLabel(trade.confirmedAt ?? trade.executedAt ?? trade.createdAt)}</span>
                <span>{proofLabel}</span>
              </div>
              <div className="executed-trade-proof">
                <span>
                  {isWalletRead ? <WalletIcon className="h-3 w-3" aria-hidden="true" /> : <ShieldCheckIcon className="h-3 w-3" aria-hidden="true" />}
                  {isWalletRead
                    ? text(trade.readSource, 'agent wallet read')
                    : trade.cmcServerVerified
                    ? text(trade.cmcTool, 'CMC verified')
                    : text(trade.bridgeMode, isCycle ? text(trade.eventType, 'cycle') : 'ledger')}
                </span>
                {hash && explorerUrl ? (
                  <a href={explorerUrl} target="_blank" rel="noreferrer" aria-label={`Open ${shortHash(hash)} on BscScan`}>
                    {shortHash(hash)}
                    <ExternalLinkIcon className="h-3 w-3" aria-hidden="true" />
                  </a>
                ) : isWalletRead && walletUrl ? (
                  <a href={walletUrl} target="_blank" rel="noreferrer" aria-label={`Open ${shortAddress(observedWalletAddress)} on BscScan`}>
                    {shortAddress(observedWalletAddress)}
                    <ExternalLinkIcon className="h-3 w-3" aria-hidden="true" />
                  </a>
                ) : null}
                {showExpectedWallet ? <span>expected {shortAddress(expectedWalletAddress)}</span> : null}
              </div>
            </article>
          );
        }) : (
          <div className="executed-trade-empty">
            <HistoryIcon className="h-4 w-4" aria-hidden="true" />
            <strong>{unavailable ? 'Trade history unavailable' : 'No backend activity recorded'}</strong>
            <p>{unavailable ? text(history?.error, 'dashboard history sync failed') : 'Guarded cycles and backend-executed swaps will appear after the ledger records activity.'}</p>
          </div>
        )}
      </div>
    </section>
  );
}

export default ExecutedTradeHistory;

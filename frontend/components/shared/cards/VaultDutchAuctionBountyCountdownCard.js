import { Zap } from 'lucide-react';
import { fmtBps } from '@/lib/vaultDisplayFormatters';

export function VaultDutchAuctionBountyCountdownCard({ auctionState }) {
  if (!auctionState) {
    return (
      <div className="card card--accent">
        <h3 className="card__title"><Zap size={13} />Dutch Auction Bounty</h3>
        <p className="card__muted">Loading auction state…</p>
      </div>
    );
  }

  const { currentBountyBps, auctionElapsed, auctionRemaining, minBountyBps, maxBountyBps } = auctionState;
  const totalDuration = Number(auctionElapsed ?? 0n) + Number(auctionRemaining ?? 0n);
  const elapsed = Number(auctionElapsed ?? 0n);
  const progressPct = totalDuration > 0 ? Math.min(100, (elapsed / totalDuration) * 100) : 0;

  const formatTime = (s) => {
    if (s <= 0) return '0s';
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  return (
    <div className="card card--accent">
      <h3 className="card__title"><Zap size={13} />Dutch Auction Bounty</h3>

      <div className="auction__current" style={{ margin: '12px 0', textAlign: 'center' }}>
        <div className="auction__bounty-value" style={{ fontSize: '1.5em', fontWeight: 'bold' }}>
          {fmtBps(currentBountyBps)}
        </div>
        <div className="card__muted" style={{ fontSize: '0.85em' }}>Current bounty</div>
      </div>

      <div className="auction__progress-bar" style={{ margin: '12px 0' }}>
        <div className="auction__progress-fill" style={{ width: `${progressPct}%` }} />
      </div>

      <div className="auction__stats" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85em', marginBottom: 4 }}>
        <div>
          <span className="card__muted">Min </span>
          <span>{fmtBps(minBountyBps)}</span>
        </div>
        <div>
          <span className="card__muted">Max </span>
          <span>{fmtBps(maxBountyBps)}</span>
        </div>
      </div>

      <div className="auction__time" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85em' }}>
        <div>
          <span className="card__muted">Elapsed </span>
          <span>{formatTime(elapsed)}</span>
        </div>
        <div>
          <span className="card__muted">Left </span>
          <span>{formatTime(Number(auctionRemaining ?? 0n))}</span>
        </div>
      </div>
    </div>
  );
}

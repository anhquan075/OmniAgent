import { fmtBps } from '@/lib/vaultDisplayFormatters';
import { Zap } from 'lucide-react';
export function VaultCircuitBreakerCard({ breakerState }) {
  const { paused, signalA, signalB, signalC, lastTripTimestamp, recoveryTimestamp } = breakerState ?? {};
  const now = Math.floor(Date.now() / 1000);
  const recoveryIn = paused && recoveryTimestamp > now ? recoveryTimestamp - now : 0;

  const signalIndicator = (label, active, description) => (
    <div className="breaker__signal" key={label} style={{ minWidth: 80, flex: '0 0 auto' }}>
      <span className={`breaker__dot ${active ? 'breaker__dot--tripped' : 'breaker__dot--clear'}`} />
      <div>
        <strong>{label}</strong>
        <div className="card__muted" style={{ fontSize: '0.85em' }}>{description}</div>
      </div>
    </div>
  );

  return (
    <div className="card card--accent">
      <h3 className="card__title" style={{ marginBottom: 6, fontSize: 11 }}>Circuit Breaker</h3>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 10px', borderRadius: 8,
        background: paused ? 'rgba(255,65,65,.08)' : 'rgba(200,147,90,.06)',
        border: paused ? '1px solid rgba(255,65,65,.18)' : '1px solid rgba(200,147,90,.12)',
        ...(paused ? { color: 'var(--danger)' } : {})
      }}>
        <span className={`breaker__dot ${paused ? 'breaker__dot--tripped' : 'breaker__dot--clear'}`} />
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.04em' }}>
          {paused
            ? `Paused${recoveryIn > 0 ? ` — ${Math.floor(recoveryIn / 60)}m ${recoveryIn % 60}s` : ''}`
            : 'Operational'
          }
        </span>
      </div>
      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {signalIndicator('A', signalA, 'Chainlink dev.')}
        {signalIndicator('B', signalB, 'Reserve ratio')}
        {signalIndicator('C', signalC, 'Virtual price')}
      </div>

      {lastTripTimestamp > 0 && (
        <div className="card__muted" style={{ marginTop: 8, fontSize: 9 }}>
          Last: {new Date(Number(lastTripTimestamp) * 1000).toLocaleString()}
        </div>
      )}
    </div>
  );
}

export function VaultDutchAuctionCard({ auctionState }) {
  const { currentBountyBps, auctionElapsed, auctionRemaining, minBountyBps, maxBountyBps } = auctionState ?? {};
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
    <div className="card card--accent" style={{ paddingBottom: 16 }}>
      <h3 className="card__title" style={{ marginBottom: 6, fontSize: 11 }}><Zap size={13} />Dutch Auction Bounty</h3>
      {auctionState ? (
        <>
          <div style={{ textAlign: 'center', marginBottom: 6 }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent)', margin: '2px 0' }}>{fmtBps(currentBountyBps)}</div>
            <div className="card__muted" style={{ fontSize: 9 }}>Current bounty</div>
          </div>
          <div className="auction__progress-bar" style={{ marginBottom: 6, height: 4 }}>
            <div className="auction__progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9 }}>
            <span className="card__muted">Min {fmtBps(minBountyBps)}</span>
            <span className="card__muted">Max {fmtBps(maxBountyBps)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, marginTop: 4 }}>
            <span className="card__muted">Elapsed {formatTime(elapsed)}</span>
            <span className="card__muted">Left {formatTime(Number(auctionRemaining ?? 0n))}</span>
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 36 }}>
          <div className="skeleton" style={{ width: '70%', height: 24, borderRadius: 6 }} />
        </div>
      )}
    </div>
  );
}

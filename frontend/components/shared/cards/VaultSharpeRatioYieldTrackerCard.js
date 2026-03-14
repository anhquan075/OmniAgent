import { TrendingUp } from 'lucide-react';

export function VaultSharpeRatioYieldTrackerCard({ sharpeState }) {
  if (!sharpeState) {
    return (
      <div className="card card--accent" style={{ display:'flex', flexDirection:'column' }}>
        <h3 className="card__title" style={{ marginBottom: 8 }}><TrendingUp size={14} style={{ display:'inline', verticalAlign:'middle', marginRight:6 }} />Sharpe Ratio</h3>
        <div className="skeleton" style={{ width: '60%', height: 32, borderRadius: 6, marginBottom: 8 }} />
        <div className="skeleton" style={{ width: '80%', height: 12, borderRadius: 4 }} />
      </div>
    );
  }

  const { meanYieldBps, volatility, sharpe, observationCount } = sharpeState;

  const sharpeNum = Number(sharpe);
  const sharpeDisplay = (sharpeNum / 10000).toFixed(2);
  const meanDisplay = (Number(meanYieldBps) / 100).toFixed(2);
  const volDisplay = (Number(volatility) / 100).toFixed(2);

  let sharpeColor = 'sharpe--neutral';
  if (observationCount >= 3) {
    if (sharpeNum >= 10000) sharpeColor = 'sharpe--good';
    else if (sharpeNum >= 5000) sharpeColor = 'sharpe--moderate';
    else sharpeColor = 'sharpe--poor';
  }

  return (
    <div className="card card--accent" style={{ display: 'flex', flexDirection: 'column', paddingBottom: 16 }}>
      <h3 className="card__title"><TrendingUp size={14} style={{ display:'inline', verticalAlign:'middle', marginRight:6 }} />Sharpe Ratio</h3>

      <div className={`sharpe__value ${sharpeColor}`} style={{ flexShrink: 0 }} title="Sharpe ratio computes to 0.00 until the vault accrues positive yield between execution cycles">
        {observationCount > 0 ? sharpeDisplay : '—'}
      </div>
      <div className="card__muted" style={{ textAlign: 'center', marginBottom: 4, fontSize: '0.75em', wordBreak: 'break-word', whiteSpace: 'normal', flexShrink: 0 }}>
        {observationCount >= 3
          ? `Risk-adjusted return (${observationCount} cycles)`
          : observationCount > 0 
            ? `Need ${Math.max(0, 3 - Number(observationCount))} more cycles for full window`
            : `Need 3 more cycles`}
      </div>
      <div className="sharpe__stats" style={{ marginTop: 'auto', paddingTop: 4 }}>
        <div className="sharpe__stat">
          <div className="card__muted" style={{ marginBottom: 2, fontSize: '9px' }}>Mean Yield</div>
          <div title="Average yield per cycle">{observationCount > 0 ? `${meanDisplay}%` : '—'}</div>
        </div>
        <div className="sharpe__stat">
          <div className="card__muted" style={{ marginBottom: 2, fontSize: '9px' }}>Volatility</div>
          <div title="Standard deviation of yield">{observationCount > 0 ? `${volDisplay}%` : '—'}</div>
        </div>
        <div className="sharpe__stat">
          <div className="card__muted" style={{ marginBottom: 2, fontSize: '9px' }}>Obs.</div>
          <div>{String(observationCount)}</div>
        </div>
      </div>
    </div>
  );
}

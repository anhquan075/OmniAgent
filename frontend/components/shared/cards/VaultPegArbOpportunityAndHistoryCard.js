import { fmtBps } from '@/lib/vaultDisplayFormatters';
import { ArrowLeftRight } from 'lucide-react';

export function VaultPegArbOpportunityAndHistoryCard({ arbPreview, onExecuteArb, busyAction }) {
  // Default values when no data available
  const hasData = !!arbPreview;
  const { direction = 0, estimatedProfitBps = 0n, tradeSize = 0n, poolPrice = 0n } = arbPreview || {};

  const directionLabels = { 0: 'None', 1: 'Buy USDF', 2: 'Sell USDF' };
  const directionLabel = directionLabels[Number(direction)] || 'Unknown';
  const hasOpportunity = Number(direction) !== 0;

  const PRICE_SCALE = 1e18;
  const priceDisplay = poolPrice ? (Number(poolPrice) / PRICE_SCALE).toFixed(6) : '—';
  const tradeSizeDisplay = tradeSize ? (Number(tradeSize) / 1e18).toFixed(2) : '0';
  const profitDisplay = fmtBps(estimatedProfitBps);

  // Calculate price deviation from peg (1.0)
  const priceDev = poolPrice ? ((Number(poolPrice) / PRICE_SCALE - 1.0) * 100).toFixed(4) : '0';
  const priceDevAbs = Math.abs(parseFloat(priceDev));

  return (
    <div className="card card--accent">
      <h3 className="card__title">
        <ArrowLeftRight size={14} style={{ display:'inline', verticalAlign:'middle', marginRight:6 }} />
        Peg Arbitrage
      </h3>

      <div className="arb__grid">
        {/* Square 1: Pool Price */}
        <div className="arb__square">
          <div className="arb__square-header">Pool Price</div>
          <div className="arb__square-main">{priceDisplay}</div>
          <div className="arb__square-sub">
            <span className={priceDevAbs > 0.1 ? 'text--warning' : 'text--success'}>
              {priceDev > 0 ? '+' : ''}{priceDev}%
            </span>
          </div>
        </div>

        {/* Square 2: Direction */}
        <div className="arb__square">
          <div className="arb__square-header">Direction</div>
          <div className="arb__square-main arb__square-main--icon">
            {hasOpportunity ? (
              <span className="signal-dot signal-dot--active" />
            ) : (
              <span className="signal-dot signal-dot--inactive" />
            )}
          </div>
          <div className="arb__square-sub">{directionLabel}</div>
        </div>

        {/* Square 3: Est. Profit */}
        <div className="arb__square">
          <div className="arb__square-header">Est. Profit</div>
          <div className="arb__square-main">{profitDisplay}</div>
          <div className="arb__square-sub">{tradeSizeDisplay} USDT</div>
        </div>

        {/* Square 4: Execute */}
        <div className="arb__square arb__square--action">
          <div className="arb__square-header">Execute</div>
          {hasOpportunity && onExecuteArb ? (
            <button
              type="button"
              className="btn btn--primary btn--square-action"
              onClick={onExecuteArb}
              disabled={busyAction === 'arb'}
            >
              {busyAction === 'arb' ? 'Executing…' : 'Arb Now'}
            </button>
          ) : (
            <div className="arb__square-main arb__square-main--muted">
              {hasOpportunity ? '—' : 'None'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

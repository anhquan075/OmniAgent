import { fmtBps, fmtPrice } from "@/lib/vaultDisplayFormatters";
import { Activity } from 'lucide-react';

export function VaultOraclePolicyMetricsCard({ algoMetrics, harvestGasEstimate, harvestGasMultiplier }) {
  return (
    <div className="card">
      <p className="eyebrow">Oracle &amp; Policy</p>
      <h3 className="cardTitle"><Activity size={13} style={{ marginRight: 6, opacity: 0.7 }} />Live Metrics</h3>

      <div className="kpiGrid" style={{ marginTop: 12 }}>
        <div className="kpi">
          <span className="kpiLabel">Current Price</span>
          <span className="kpiValue">{fmtPrice(algoMetrics?.currentPrice)}</span>
        </div>
        <div className="kpi">
          <span className="kpiLabel">Volatility</span>
          <span className="kpiValue">{fmtBps(algoMetrics?.volatilityBps)}</span>
        </div>
        <div className="kpi">
          <span className="kpiLabel">Depeg Threshold</span>
          <span className="kpiValue">{fmtPrice(algoMetrics?.depegPrice)}</span>
        </div>
      </div>

      <table className="oracleTable">
        <thead>
          <tr>
            <th>State Trigger</th>
            <th>Volatility Threshold</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Guarded</td>
            <td>{fmtBps(algoMetrics?.guardedVolatilityBps)}</td>
          </tr>
          <tr>
            <td>Drawdown</td>
            <td>{fmtBps(algoMetrics?.drawdownVolatilityBps)}</td>
          </tr>
        </tbody>
      </table>

      {/* Hysteresis de-escalation band — prevents flip-flopping between risk states */}
      <div style={{ marginTop: 14, padding: '10px 12px', background: 'rgba(200,147,90,.06)', borderRadius: 6, border: '1px solid rgba(200,147,90,.15)' }}>
        <p style={{ fontSize: 10, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6, fontWeight: 600 }}>Hysteresis Band</p>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div>

            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Mechanism</span>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', display: 'block', marginTop: 2 }}>Asymmetric — instant escalation, buffered de-escalation</span>
          </div>
        </div>
      </div>

      {/* Gas-gated harvest parameters — shows when auto-harvest skips unprofitable harvests */}
      {(harvestGasEstimate != null || harvestGasMultiplier != null) && (
        <div style={{ marginTop: 14, padding: '10px 12px', background: 'rgba(74,222,128,.05)', borderRadius: 6, border: '1px solid rgba(74,222,128,.12)' }}>
          <p style={{ fontSize: 10, color: '#4ade80', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6, fontWeight: 600 }}>Gas-Gated Harvest</p>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Gas Estimate</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', display: 'block' }}>{harvestGasEstimate != null ? harvestGasEstimate.toLocaleString() : '—'} gas</span>
            </div>
            <div>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Cost Multiplier</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', display: 'block' }}>{harvestGasMultiplier != null ? `${harvestGasMultiplier}×` : '—'}</span>
            </div>
            <div>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Behavior</span>
              <span style={{ fontSize: 11, color: 'var(--text-dim)', display: 'block', marginTop: 2 }}>Skips harvest if CAKE reward &lt; gas cost × multiplier</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

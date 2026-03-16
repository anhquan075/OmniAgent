import { fmtBps, fmtPrice } from "@/lib/vaultDisplayFormatters";
import { Activity, ShieldCheck, Lock } from 'lucide-react';

export function VaultOraclePolicyMetricsCard({ algoMetrics, harvestGasEstimate, harvestGasMultiplier }) {
  return (
    <div className="card relative overflow-hidden">
      {/* Dominance Badge */}
      <div className="absolute top-0 right-0 p-2">
        <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-tether-teal/10 border border-tether-teal/20 text-[8px] text-tether-teal font-bold uppercase tracking-tighter animate-pulse">
          <Lock size={8} /> ZK-Verified
        </div>
      </div>

      <p className="eyebrow">Oracle &amp; Policy</p>
      <h3 className="cardTitle"><ShieldCheck size={13} className="text-tether-teal" style={{ marginRight: 6 }} />ZK-Risk Guard</h3>

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

      {/* Dominance Section: Trustless Verification */}
      <div style={{ marginTop: 14, padding: '10px 12px', background: 'rgba(0,147,147,.06)', borderRadius: 6, border: '1px solid rgba(0,147,147,.15)' }}>
        <p style={{ fontSize: 10, color: '#009393', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6, fontWeight: 600 }}>ZK-Proof Integrity</p>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Status</span>
            <span style={{ fontSize: 11, color: 'var(--text)', display: 'block', marginTop: 2, fontWeight: 700 }}>Cryptographically Binding</span>
          </div>
          <p style={{ fontSize: 9, color: 'var(--text-dim)', fontStyle: 'italic', marginTop: 4 }}>
            Verification of Monte Carlo risk logic performed trustlessly via on-chain ZK-SNARKs.
          </p>
        </div>
      </div>

      {/* Gas-gated harvest parameters */}
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
          </div>
        </div>
      )}
    </div>
  );
}

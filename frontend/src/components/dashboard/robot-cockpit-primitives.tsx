export function Metric({ label, value }: { label: string; value: string }) {
  return <div className="robot-metric"><span>{label}</span><strong>{value}</strong></div>;
}

export function MarketChip({ symbol, value }: { symbol: string; value: unknown }) {
  const price = Number(value);
  return (
    <div className="robot-market-chip">
      <span>{symbol}</span>
      <strong>{Number.isFinite(price) ? `$${price.toFixed(price > 10 ? 2 : 4)}` : '--'}</strong>
    </div>
  );
}

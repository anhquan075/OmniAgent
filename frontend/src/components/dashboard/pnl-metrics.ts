type Payload = Record<string, any>;

const signedPct = (value: unknown, fallback = 'syncing') => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return `${numeric >= 0 ? '+' : ''}${numeric.toFixed(2)}%`;
};

const toneFor = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) return 'is-neutral';
  return numeric > 0 ? 'is-good' : 'is-bad';
};

export const registrationPnlView = (ledger: Payload | undefined) => {
  const pnl = ledger?.pnl ?? {};
  const period = pnl.registrationPeriod ?? {};
  const hasRegistrationWindow = period.source === 'competition_registered';
  const source = hasRegistrationWindow ? period : pnl;
  const value = source.totalReturnPct;
  const days = Number(period.days);
  const pending = source.available === false
    || source.status === 'missing_trade_pnl'
    || source.status === 'partial'
    || Number(source.missingPnlTrades) > 0;
  const missingTrades = Number(source.missingPnlTrades ?? source.confirmedTrades);

  return {
    label: pending ? 'pending' : signedPct(value),
    metricLabel: hasRegistrationWindow ? 'Reg PnL' : 'PnL',
    hint: pending && Number.isFinite(missingTrades) && missingTrades > 0
      ? `${missingTrades} trade PnL missing`
      : hasRegistrationWindow && Number.isFinite(days) && days > 0
      ? `${days}d to today`
      : 'register to today',
    tone: pending ? 'is-neutral' : toneFor(value),
  };
};

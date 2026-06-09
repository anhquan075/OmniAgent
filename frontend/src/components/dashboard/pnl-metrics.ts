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
  const value = hasRegistrationWindow ? period.totalReturnPct : pnl.totalReturnPct;
  const days = Number(period.days);

  return {
    label: signedPct(value),
    metricLabel: hasRegistrationWindow ? 'Reg PnL' : 'PnL',
    hint: hasRegistrationWindow && Number.isFinite(days) && days > 0
      ? `${days}d to today`
      : 'register to today',
    tone: toneFor(value),
  };
};

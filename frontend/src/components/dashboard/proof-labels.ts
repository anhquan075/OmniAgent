type LabelOptions = {
  stripCasperPrefix?: boolean;
};

export const proofText = (value: unknown, fallback = 'pending') => (
  value === undefined || value === null || value === '' ? fallback : String(value)
);

export const proofLabel = (value: unknown, options: LabelOptions = {}) => {
  const casperPattern = options.stripCasperPrefix ? /^casper[-_]/ : /^casper_/;
  return proofText(value).replace(casperPattern, '').replace(/[-_]/g, ' ');
};

export const isConcreteProofValue = (value: unknown) => {
  const normalized = proofText(value, '').toLowerCase();
  return normalized !== '' && !['missing', 'pending'].includes(normalized);
};

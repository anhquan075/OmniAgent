type LabelOptions = {
  stripCasperPrefix?: boolean;
};

export const proofText = (value: unknown, fallback = 'pending') => (
  value === undefined || value === null || value === '' ? fallback : String(value)
);

export const proofLabel = (value: unknown, options: LabelOptions = {}) => {
  const casperPattern = options.stripCasperPrefix
    ? /^casper(?:[-_ ]+|(?=[A-Z]))/i
    : /^casper_/;
  return proofText(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(casperPattern, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
};

export const isConcreteProofValue = (value: unknown) => {
  const normalized = proofText(value, '').toLowerCase();
  return normalized !== '' && !['missing', 'pending'].includes(normalized);
};

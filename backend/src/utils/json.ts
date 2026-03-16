/**
 * JSON.stringify replacer to handle BigInt values by converting them to strings.
 */
export const bigIntReplacer = (_key: string, value: any) => {
  return typeof value === 'bigint' ? value.toString() : value;
};

/**
 * Safely parse JSON or return default value
 */
export const safeJsonParse = <T>(json: string, fallback: T): T => {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
};

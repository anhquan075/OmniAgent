/// Shared display formatting helpers for vault card components.
/// toSafeNumber returns null (not 0) on invalid input so callers render "—" instead of a wrong zero.

export function toSafeNumber(value: any): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function fmtBps(v: any): string {
  const n = toSafeNumber(v);
  if (n === null) return "—";
  return (n / 100).toFixed(2) + "%";
}

export function fmtPrice(v: any): string {
  const n = toSafeNumber(v);
  if (n === null) return "—";
  return "$" + (n / 1e8).toFixed(6);
}

export function fmtWdks(raw: any): string {
  if (raw == null) return "—";
  try {
    const n = BigInt(raw);
    const whole = n / BigInt(1e18);
    return "$" + Number(whole).toLocaleString(undefined, { maximumFractionDigits: 2 });
  } catch {
    return "—";
  }
}

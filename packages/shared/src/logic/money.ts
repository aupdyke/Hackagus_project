/** Money helpers. Code rounds; the model never supplies or formats amounts. */
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** `12345.6` → `$12,345.60`;  `{ cents: false }` → `$12,346` */
export function formatUSD(n: number, opts: { cents?: boolean } = {}): string {
  const cents = opts.cents ?? false;
  const v = cents ? round2(n) : Math.round(n);
  const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
  return `${v < 0 ? '-' : ''}$${s}`;
}

export const ESTIMATE_LABEL = 'Estimate';
export const ESTIMATE_NOTE = 'All costs are estimates computed from synthetic rates, not quotes.';

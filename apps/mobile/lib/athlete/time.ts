/** Local-datetime helpers for the athlete screens. Trip times have no time zone → treat as device local time. */
export function localDate(ldt: string): Date {
  const [d, t = '00:00'] = ldt.split('T');
  const [y, m, day] = d!.split('-').map(Number);
  const [hh, mm] = t.split(':').map(Number);
  return new Date(y!, m! - 1, day!, hh!, mm!);
}

/** "2d 14h 05m" / "3h 05m" / "12m" */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  const mm = String(m).padStart(2, '0');
  if (d > 0) return `${d}d ${h}h ${mm}m`;
  if (h > 0) return `${h}h ${mm}m`;
  return `${m}m`;
}

/** "5 min ago", "2 h ago", "3 d ago" */
export function timeAgo(iso: string, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

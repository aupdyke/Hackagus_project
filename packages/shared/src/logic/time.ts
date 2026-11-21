/** Local date/time helpers. All math is done on naive local times (no time zones) using UTC arithmetic. */

const pad = (n: number) => String(n).padStart(2, '0');

function toDate(ldt: string): Date {
  const [d, t = '00:00'] = ldt.split('T');
  const [y, m, day] = d!.split('-').map(Number);
  const [hh, mm] = t.split(':').map(Number);
  return new Date(Date.UTC(y!, m! - 1, day!, hh!, mm!));
}
function fromDate(dt: Date): string {
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}`;
}

/** `2026-11-28` + `12:00` → `2026-11-28T12:00` */
export const combine = (date: string, clock: string) => `${date}T${clock}`;
export const datePart = (ldt: string) => ldt.slice(0, 10);
export const clockPart = (ldt: string) => ldt.slice(11, 16);

export function addMinutes(ldt: string, minutes: number): string {
  return fromDate(new Date(toDate(ldt).getTime() + Math.round(minutes) * 60_000));
}
export function addDays(date: string, days: number): string {
  return datePart(addMinutes(`${date}T00:00`, days * 24 * 60));
}
/** b - a in hours (positive when b is later) */
export function hoursBetween(a: string, b: string): number {
  return (toDate(b).getTime() - toDate(a).getTime()) / 3_600_000;
}
export const isBefore = (a: string, b: string) => toDate(a).getTime() < toDate(b).getTime();
export const minutesOfDay = (clock: string) => {
  const [h, m] = clock.split(':').map(Number);
  return h! * 60 + m!;
};

const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type Dow = (typeof DOW)[number];
export const dayOfWeek = (date: string): Dow => DOW[toDate(`${date}T00:00`).getUTCDay()]!;

/**
 * Resolve a constraint day relative to the game date. Weekday names resolve to the closest such day
 * on or before the game date (within 6 days). Returns null for '' or unknown.
 */
export function resolveDay(gameDate: string, day: string): string | null {
  if (day === 'game_day') return gameDate;
  if (day === 'day_before') return addDays(gameDate, -1);
  if (day === 'two_days_before') return addDays(gameDate, -2);
  const idx = DOW.indexOf(day as Dow);
  if (idx < 0) return null;
  for (let back = 0; back <= 6; back++) {
    const d = addDays(gameDate, -back);
    if (dayOfWeek(d) === day) return d;
  }
  return null;
}

/** `14:05` → `2:05 PM` */
export function formatClock(clockOrLdt: string): string {
  const clock = clockOrLdt.includes('T') ? clockPart(clockOrLdt) : clockOrLdt;
  const [h, m] = clock.split(':').map(Number);
  const suffix = h! >= 12 ? 'PM' : 'AM';
  const h12 = h! % 12 === 0 ? 12 : h! % 12;
  return `${h12}:${pad(m!)} ${suffix}`;
}
const DOW_LABEL: Record<Dow, string> = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** `2026-11-27T14:00` → `Fri Nov 27, 2:00 PM` */
export function formatDayTime(ldt: string): string {
  const d = datePart(ldt);
  const [, m, day] = d.split('-').map(Number);
  return `${DOW_LABEL[dayOfWeek(d)]} ${MONTHS[m! - 1]} ${day}, ${formatClock(ldt)}`;
}
/** `2026-11-28` → `Sat Nov 28` */
export function formatDate(date: string): string {
  const [, m, day] = date.split('-').map(Number);
  return `${DOW_LABEL[dayOfWeek(date)]} ${MONTHS[m! - 1]} ${day}`;
}
export const isValidClock = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

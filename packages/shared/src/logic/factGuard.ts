/**
 * Fact guard — task A-04. Every piece of model prose passes through here.
 * Any dollar amount, number with units (miles, hours, rooms, buses, players, nights), clock time or date in
 * `text` must match a value in `allowed` (the facts our code supplied for that call). Every option/candidate/
 * fact id mentioned must be in `allowed.ids`.
 *
 * Matching rules: money ±$1 (±1% for `$9.8k` forms); numbers with units compare exactly after unit
 * normalisation (hours ±0.05); times normalise "2 PM", "2:30 p.m.", "14:30", "noon" → HH:MM; dates normalise
 * "Nov 28", "11/28", "2026-11-28" (year optional), and weekday names must match a fact date's weekday.
 * Bare numbers without units are ignored. Deterministic, regex only — no AI.
 */
import type { FactGuardResult, TravelPackage } from '../domain';
import { round2 } from './money';
import { clockPart, datePart, dayOfWeek, type Dow } from './time';

export interface AllowedFacts {
  money: number[];
  /** unit → allowed values, e.g. { miles: [200, 400], hours: [3.6], rooms: [55], buses: [2] } (keys are normalised) */
  quantities: Record<string, number[]>;
  /** HH:MM */
  times: string[];
  /** YYYY-MM-DD */
  dates: string[];
  /** option/candidate/fact ids */
  ids: string[];
}

export function emptyFacts(): AllowedFacts {
  return { money: [], quantities: {}, times: [], dates: [], ids: [] };
}

// ---------- normalisation ----------

const UNIT_ALIASES: [RegExp, string][] = [
  [/^(miles?|mi)$/, 'mile'],
  [/^(hours?|hrs?|h)$/, 'hour'],
  [/^(minutes?|mins?)$/, 'minute'],
  [/^rooms?$/, 'room'],
  [/^(bus|buses|busses)$/, 'bus'],
  [/^players?$/, 'player'],
  [/^coach(es)?$/, 'coach'],
  [/^staff$/, 'staff'],
  [/^travell?ers?$/, 'traveler'],
  [/^nights?$/, 'night'],
  [/^meals?$/, 'meal'],
  [/^(%|percent)$/, 'percent'],
];
/** `"Miles"` → `"mile"`, `"buses"` → `"bus"`, `"%"` → `"percent"`; unknown units are lower-cased as-is. */
export function normalizeUnit(unit: string): string {
  const u = unit.trim().toLowerCase();
  for (const [re, norm] of UNIT_ALIASES) if (re.test(u)) return norm;
  return u;
}

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};
const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const WEEKDAYS: Record<string, Dow> = {
  mon: 'mon', tue: 'tue', wed: 'wed', thu: 'thu', fri: 'fri', sat: 'sat', sun: 'sun',
};
const pad2 = (n: number) => String(n).padStart(2, '0');
const num = (s: string) => Number(s.replace(/,/g, ''));

// ---------- extraction ----------

type Kind = 'id' | 'money' | 'date' | 'time' | 'quantity' | 'weekday';
interface Mention {
  kind: Kind;
  raw: string;
  index: number;
  ok: (a: AllowedFacts) => boolean;
  issue: string;
  /** adds this mention's value to `f` (used by factsFromText for trusted code text) */
  allow?: (f: AllowedFacts) => void;
}

const UNIT_RE = '(%|percent|miles?|minutes?|mins?|mi|hours?|hrs?|h|rooms?|busses|buses|bus|players?|coach(?:es)?|staff|travell?ers?|nights?|meals?)';
const NUM_WORDS_RE = Object.keys(WORD_NUMBERS).sort((a, b) => b.length - a.length).join('|');
const MONTH_RE = '(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const WEEKDAY_RE = '\\b(Mon(?:day)?|Tue(?:s(?:day)?)?|Wed(?:nesday)?|Thu(?:r(?:s(?:day)?)?)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)\\b\\.?';

const near = (v: number, allowed: number[], tol: number) => allowed.some((a) => Math.abs(v - a) <= tol + 1e-9 || Math.abs(v - Math.abs(a)) <= tol + 1e-9);
const dateOk = (a: AllowedFacts, month: number, day: number, year: number | null) =>
  a.dates.some((d) => d.slice(5) === `${pad2(month)}-${pad2(day)}` && (year === null || d.startsWith(String(year))));
const timeOk = (a: AllowedFacts, hhmm: string) => a.times.includes(hhmm);

/** Ordered extractors; each match is masked so later (looser) patterns don't re-read its digits. */
const EXTRACTORS: { re: RegExp; make: (m: RegExpExecArray) => Omit<Mention, 'raw' | 'index'> | null }[] = [
  // IDs
  {
    re: /\b(PKG-[A-Z0-9]+-[A-Z]|SAV-\d+|IT-\d+|ML-\d+|[HR]-[A-Z]{3}-\d+|F-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)\b/g,
    make: (m) => ({ kind: 'id', ok: (a) => a.ids.includes(m[1]!), issue: `${m[1]} is not a known id`, allow: (f) => void f.ids.push(m[1]!) }),
  },
  // Money: $1,234 · $1,234.56 · $9.8k · $12K
  {
    re: /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(?:\s?([kK])(?![a-zA-Z]))?/g,
    make: (m) => {
      const base = num(m[1]!) + (m[2] ? Number(m[2]) : 0);
      const k = !!m[3];
      const v = k ? base * 1000 : base;
      return { kind: 'money', ok: (a) => (k ? a.money.some((x) => Math.abs(v - Math.abs(x)) <= Math.abs(x) * 0.01 + 1e-9) : near(v, a.money, 1)), issue: `${m[0].trim()} is not in the facts`, allow: (f) => void f.money.push(v) };
    },
  },
  // ISO date (optionally followed by a THH:MM time)
  {
    re: /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?:T([01]\d|2[0-3]):([0-5]\d))?(?!\d)/g,
    make: (m) => {
      const date = `${m[1]}-${m[2]}-${m[3]}`;
      const time = m[4] ? `${m[4]}:${m[5]}` : null;
      return {
        kind: 'date',
        ok: (a) => a.dates.includes(date) && (time === null || timeOk(a, time)),
        issue: `${m[0]} is not in the facts`,
        allow: (f) => {
          f.dates.push(date);
          if (time) f.times.push(time);
        },
      };
    },
  },
  // Month-name date: Nov 28 · November 28th, 2026
  {
    re: new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?(?!\\d)`, 'g'),
    make: (m) => {
      const month = MONTHS[m[1]!.slice(0, 3).toLowerCase()]!;
      const day = Number(m[2]);
      const year = m[3] ? Number(m[3]) : null;
      return { kind: 'date', ok: (a) => dateOk(a, month, day, year), issue: `${m[0]} is not in the facts`, allow: year ? (f) => void f.dates.push(`${year}-${pad2(month)}-${pad2(day)}`) : undefined };
    },
  },
  // Numeric date: 11/28 · 11/28/2026
  {
    re: /(?<![\d/])(1[0-2]|0?[1-9])\/(3[01]|[12]\d|0?[1-9])(?:\/(\d{4}|\d{2}))?(?![\d/])/g,
    make: (m) => {
      const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : null;
      return { kind: 'date', ok: (a) => dateOk(a, Number(m[1]), Number(m[2]), year), issue: `${m[0]} is not in the facts`, allow: year ? (f) => void f.dates.push(`${year}-${pad2(Number(m[1]))}-${pad2(Number(m[2]))}`) : undefined };
    },
  },
  // 12-hour time: 2 PM · 2:30 p.m.
  {
    re: /(?<![\d:])(1[0-2]|0?[1-9])(?::([0-5]\d))?\s?([aApP])\.?\s?[mM]\.?(?![a-zA-Z])/g,
    make: (m) => {
      let h = Number(m[1]) % 12;
      if (m[3]!.toLowerCase() === 'p') h += 12;
      const hhmm = `${pad2(h)}:${m[2] ?? '00'}`;
      return { kind: 'time', ok: (a) => timeOk(a, hhmm), issue: `${m[0].trim()} is not in the facts`, allow: (f) => void f.times.push(hhmm) };
    },
  },
  // 24-hour time: 14:30
  {
    re: /(?<![\d:])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])/g,
    make: (m) => {
      const hhmm = `${pad2(Number(m[1]))}:${m[2]}`;
      return { kind: 'time', ok: (a) => timeOk(a, hhmm), issue: `${m[0]} is not in the facts`, allow: (f) => void f.times.push(hhmm) };
    },
  },
  // noon / midnight
  {
    re: /\b(noon|midnight)\b/gi,
    make: (m) => {
      const hhmm = m[1]!.toLowerCase() === 'noon' ? '12:00' : '00:00';
      return { kind: 'time', ok: (a) => timeOk(a, hhmm), issue: `"${m[0]}" (${hhmm}) is not in the facts`, allow: (f) => void f.times.push(hhmm) };
    },
  },
  // Quantities: 400 miles · 3.6 hours · three buses · 2-night · 8%
  {
    re: new RegExp(`(?<![\\w.$,])(\\d{1,3}(?:,\\d{3})+|\\d+(?:\\.\\d+)?|${NUM_WORDS_RE})(?:\\s?-\\s?|\\s?)${UNIT_RE}(?![a-zA-Z])`, 'gi'),
    make: (m) => {
      const token = m[1]!.toLowerCase();
      const v = WORD_NUMBERS[token] ?? num(token);
      const unit = normalizeUnit(m[2]!);
      const tol = unit === 'hour' ? 0.05 : 0;
      return {
        kind: 'quantity',
        ok: (a) => near(v, allowedQuantities(a, unit), tol),
        issue: `${m[0]} is not in the facts`,
        allow: (f) => void (f.quantities[unit] ??= []).push(v),
      };
    },
  },
  // Weekday names must be the weekday of an allowed date
  {
    re: new RegExp(WEEKDAY_RE, 'g'),
    make: (m) => {
      const dow = WEEKDAYS[m[1]!.slice(0, 3).toLowerCase()]!;
      return { kind: 'weekday', ok: (a) => a.dates.some((d) => dayOfWeek(d) === dow), issue: `${m[1]} doesn't match any trip date` };
    },
  },
];

/** Allowed values for a normalised unit, accepting un-normalised keys in `allowed.quantities` too. */
function allowedQuantities(a: AllowedFacts, unit: string): number[] {
  const out: number[] = [];
  for (const [k, vs] of Object.entries(a.quantities)) if (normalizeUnit(k) === unit) out.push(...vs);
  return out;
}

function extract(text: string): Mention[] {
  let masked = text;
  const mentions: Mention[] = [];
  for (const { re, make } of EXTRACTORS) {
    re.lastIndex = 0;
    const found: RegExpExecArray[] = [];
    for (let m = re.exec(masked); m; m = re.exec(masked)) {
      if (m[0].length === 0) { re.lastIndex++; continue; }
      found.push(m);
    }
    for (const m of found) {
      const made = make(m);
      if (made) mentions.push({ ...made, raw: m[0], index: m.index });
      masked = masked.slice(0, m.index) + ' '.repeat(m[0].length) + masked.slice(m.index + m[0].length);
    }
  }
  return mentions.sort((x, y) => x.index - y.index);
}

/** Sentence spans: split on . ! ? followed by whitespace/end, or newlines. */
function sentences(text: string): { start: number; end: number; text: string }[] {
  const out: { start: number; end: number; text: string }[] = [];
  const re = /[.!?]+(?=\s|$)|\n+/g;
  let start = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const end = m.index + m[0].length;
    out.push({ start, end, text: text.slice(start, end).trim() });
    start = end;
  }
  if (start < text.length) out.push({ start, end: text.length, text: text.slice(start).trim() });
  return out.filter((s) => s.text !== '');
}

export function factGuard(text: string, allowed: AllowedFacts): FactGuardResult & { bad_sentences: string[] } {
  if (!text || !text.trim()) return { passed: true, replaced: false, issues: [], bad_sentences: [] };
  const bad = extract(text).filter((m) => !m.ok(allowed));
  const issues = [...new Set(bad.map((m) => m.issue))];
  const spans = sentences(text);
  const bad_sentences: string[] = [];
  for (const m of bad) {
    const s = spans.find((sp) => m.index >= sp.start && m.index < sp.end);
    if (s && !bad_sentences.includes(s.text)) bad_sentences.push(s.text);
  }
  return { passed: issues.length === 0, replaced: false, issues, bad_sentences };
}

// ---------- building allowed facts ----------

/**
 * Allowed facts taken FROM trusted, code-generated text (e.g. risk-flag messages we put in FACTS), so a model that
 * quotes them verbatim is not flagged. Never call this on model output.
 */
export function factsFromText(text: string): AllowedFacts {
  const f = emptyFacts();
  for (const m of extract(text)) m.allow?.(f);
  return mergeFacts(f);
}

const uniq = <T>(xs: T[]) => [...new Set(xs)];

export function mergeFacts(...facts: AllowedFacts[]): AllowedFacts {
  const quantities: Record<string, number[]> = {};
  for (const f of facts) {
    for (const [k, vs] of Object.entries(f.quantities)) {
      const u = normalizeUnit(k);
      quantities[u] = uniq([...(quantities[u] ?? []), ...vs]);
    }
  }
  return {
    money: uniq(facts.flatMap((f) => f.money)),
    quantities,
    times: uniq(facts.flatMap((f) => f.times)),
    dates: uniq(facts.flatMap((f) => f.dates)),
    ids: uniq(facts.flatMap((f) => f.ids)),
  };
}

/** Everything a model may cite about a set of packages: totals, components, pairwise total differences, counts, times, dates, ids. */
export function factsFromPackages(pkgs: TravelPackage[]): AllowedFacts {
  const f = emptyFacts();
  const q = (unit: string, ...vs: number[]) => {
    f.quantities[unit] = uniq([...(f.quantities[unit] ?? []), ...vs]);
  };
  const stamp = (ldt: string) => {
    if (!ldt) return;
    f.dates.push(datePart(ldt));
    if (ldt.includes('T')) f.times.push(clockPart(ldt));
  };

  for (const p of pkgs) {
    const c = p.costs;
    f.money.push(c.bus, c.equipment, c.hotel, c.meals, c.subtotal, c.contingency, c.total);
    for (const m of p.meals) f.money.push(m.cost, m.price_per_person);
    const n = p.counts;
    q('traveler', n.travelers);
    q('player', n.players);
    q('coach', n.coaches);
    q('staff', n.support, n.coaches + n.support);
    q('bus', n.buses);
    q('room', n.rooms_total, n.rooms_players, n.rooms_coaches, n.rooms_support, n.rooms_drivers);
    q('night', p.nights);
    q('meal', p.meals.length);
    q('mile', p.round_trip_miles, round2(p.round_trip_miles / 2));
    stamp(p.departure_local);
    stamp(p.return_local);
    for (const i of p.itinerary) { stamp(i.start_local); stamp(i.end_local); }
    for (const m of p.meals) stamp(m.time_local);
    f.ids.push(p.option_id);
    if (p.hotel_id) f.ids.push(p.hotel_id);
    for (const m of p.meals) if (m.vendor_id) f.ids.push(m.vendor_id);
  }
  for (let i = 0; i < pkgs.length; i++) {
    for (let j = i + 1; j < pkgs.length; j++) f.money.push(round2(Math.abs(pkgs[i]!.costs.total - pkgs[j]!.costs.total)));
  }
  return mergeFacts(f);
}

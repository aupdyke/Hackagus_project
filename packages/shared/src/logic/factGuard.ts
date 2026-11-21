/**
 * Fact guard — task A-04. Every piece of model prose passes through here.
 * Any dollar amount, number with units (miles, hours, rooms, buses, players, nights), clock time or date in
 * `text` must match a value in `allowed` (the facts our code supplied for that call). Every option/candidate/
 * fact id mentioned must be in `allowed.ids`.
 *
 * Matching rules: money compares after rounding to whole dollars (±$1); numbers with units compare exactly
 * after unit normalisation (mi/mile/miles); times normalise "2 PM", "2:00 pm", "14:00" → 14:00; dates
 * normalise "Nov 28", "11/28", "2026-11-28", "Saturday" (weekday must match a fact date's weekday).
 */
import type { FactGuardResult } from '../domain';
import { NotImplementedError } from '../errors';

export interface AllowedFacts {
  money: number[];
  /** unit → allowed values, e.g. { miles: [200, 400], hours: [3.6], rooms: [55], buses: [2] } */
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

export function factGuard(_text: string, _allowed: AllowedFacts): FactGuardResult & { bad_sentences: string[] } {
  throw new NotImplementedError('A-04');
}

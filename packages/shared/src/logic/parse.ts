/**
 * Turns the model's structured parse (sentinel-filled) into a TripRequestDraft for human review.
 * CODE does the opponent→game matching and day/time→datetime resolution; the model only extracts words.
 */
import type { DepartureConstraint, Game, ParseResult, RequestField, TripRequestDraft } from '../domain';
import type { AiParseOut } from '../ai/schemas';
import { combine, isValidClock, resolveDay } from './time';

const norm = (s: string) => s.toLowerCase().replace(/\(oh\)/g, ' oh ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Extra ways staff refer to opponents (mascots, abbreviations, cities). */
const ALIASES: Record<string, string[]> = {
  'Kent State': ['kent', 'ksu', 'golden flashes', 'flashes'],
  'Western Michigan': ['wmu', 'western', 'western mich', 'broncos', 'kalamazoo'],
  'Ball State': ['ball', 'bsu', 'cardinals', 'muncie'],
  'Miami (OH)': ['miami', 'miami oh', 'miami ohio', 'redhawks', 'oxford'],
  Ohio: ['ohio u', 'ohio university', 'ou', 'bobcats', 'athens'],
  Buffalo: ['ub', 'bulls', 'buffalo ny'],
};

/** Match free-text opponent (and optional explicit date) to a game in the schedule. */
export function matchGame(opponentText: string, gameDate: string, schedule: Game[]): { game: Game | null; candidates: Game[] } {
  const byDate = gameDate ? schedule.filter((g) => g.date === gameDate) : [];
  const t = norm(opponentText);
  if (!t) return { game: byDate.length === 1 ? byDate[0]! : null, candidates: byDate };
  const exact = schedule.filter((g) => norm(g.opponent) === t);
  let cands = exact;
  if (!cands.length) cands = schedule.filter((g) => (ALIASES[g.opponent] ?? []).some((a) => a === t));
  if (!cands.length) cands = schedule.filter((g) => norm(g.opponent).startsWith(t) || t.startsWith(norm(g.opponent)) || norm(g.city) === t);
  if (byDate.length && cands.length > 1) cands = cands.filter((g) => g.date === gameDate);
  return { game: cands.length === 1 ? cands[0]! : null, candidates: cands };
}

export function resolveParse(ai: AiParseOut, schedule: Game[]): Omit<ParseResult, 'source' | 'notice'> {
  const missing = new Set<RequestField>();
  const ambiguities: ParseResult['ambiguities'] = [...ai.ambiguities];

  const { game, candidates } = matchGame(ai.opponent, ai.game_date, schedule);
  if (!game) {
    missing.add('opponent');
    if (ai.opponent && candidates.length > 1) ambiguities.push({ field: 'opponent', message: `"${ai.opponent}" matches more than one game — pick one.` });
    else if (ai.opponent) ambiguities.push({ field: 'opponent', message: `"${ai.opponent}" is not on the schedule — pick the game.` });
  } else if (game.home_away === 'home') {
    missing.add('opponent');
    ambiguities.push({ field: 'opponent', message: `${game.opponent} is a home game — no travel needed. Pick an away game.` });
  }
  const validGame = game && game.home_away === 'away' ? game : null;

  const count = (v: number, f: RequestField) => {
    if (v < 0) {
      missing.add(f);
      return null;
    }
    return v;
  };

  const dc = ai.departure_constraint;
  let departure: DepartureConstraint = { kind: 'none', datetime_local: '', raw_text: '' };
  if (dc.kind !== 'none') {
    const day = validGame ? resolveDay(validGame.date, dc.day) : null;
    const timeOk = isValidClock(dc.time_24h);
    if (day && timeOk) departure = { kind: dc.kind, datetime_local: combine(day, dc.time_24h), raw_text: dc.raw_text };
    else {
      departure = { kind: dc.kind, datetime_local: '', raw_text: dc.raw_text };
      missing.add('departure_constraint');
      ambiguities.push({
        field: 'departure_constraint',
        message: !validGame ? 'Pick the game first so we can place the departure day.' : !day ? `Which day is "${dc.raw_text || 'the departure limit'}"?` : `What time is "${dc.raw_text}"?`,
      });
    }
  }

  const truck = ai.include_equipment_truck === 'unknown' ? null : ai.include_equipment_truck === 'yes';
  if (truck === null) missing.add('include_equipment_truck');

  const draft: TripRequestDraft = {
    game_id: validGame?.game_id ?? null,
    opponent_text: ai.opponent,
    players: count(ai.players, 'players'),
    coaches: count(ai.coaches, 'coaches'),
    support_staff: count(ai.support_staff, 'support_staff'),
    departure_constraint: departure,
    include_equipment_truck: truck,
    notes: '',
  };
  // de-duplicate ambiguities by field+message
  const seen = new Set<string>();
  const amb = ambiguities.filter((a) => (seen.has(a.field + a.message) ? false : (seen.add(a.field + a.message), true)));
  return { draft, missing_fields: [...missing], ambiguities: amb };
}

/** When AI is unavailable: an empty draft with everything flagged so staff fill the form by hand. */
export function fallbackParse(text: string): ParseResult {
  return {
    draft: {
      game_id: null, opponent_text: '', players: null, coaches: null, support_staff: null,
      departure_constraint: { kind: 'none', datetime_local: '', raw_text: '' },
      include_equipment_truck: null, notes: text.slice(0, 500),
    },
    missing_fields: ['opponent', 'players', 'coaches', 'support_staff', 'include_equipment_truck'],
    ambiguities: [],
    source: 'fallback',
    notice: 'AI parsing is unavailable — please fill in the form. Your text was kept in Notes.',
  };
}

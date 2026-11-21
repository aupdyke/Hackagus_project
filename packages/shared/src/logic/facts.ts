/**
 * Compact FACTS builders for prompts + matching AllowedFacts for the fact guard — task A-05 (recommend), A-08 (memo),
 * A-16 (savings). Keep these small: counts and per-option numbers only, never the roster.
 */
import type { Game, Hotel, Recommendation, SavingsCandidate, TravelPackage, TripRequest } from '../domain';
import { emptyFacts, factsFromPackages, mergeFacts, type AllowedFacts } from './factGuard';
import { NotImplementedError } from '../errors';
import { formatUSD, round2 } from './money';
import { formatDayTime } from './time';

// ---------- A-05 recommendation ----------

const hotelOf = (hotels: Hotel[], id: string) => hotels.find((h) => h.hotel_id === id) ?? null;
const riskCount = (p: TravelPackage, sev: 'critical' | 'warning') => p.risk_flags.filter((f) => f.severity === sev).length;

export function recommendFacts(game: Game, req: TripRequest, pkgs: TravelPackage[], hotels: Hotel[] = []): { facts: unknown; allowed: AllowedFacts } {
  const facts = {
    game: { opponent: game.opponent, date: game.date, kickoff: game.kickoff_local },
    request: {
      players: req.players, coaches: req.coaches, support: req.support_staff,
      constraint: req.departure_constraint.raw_text, preference: req.preference, caps: req.caps,
    },
    options: pkgs.map((p) => {
      const h = hotelOf(hotels, p.hotel_id);
      return {
        id: p.option_id, label: p.label, feasible: p.feasible, infeasible_reason: p.infeasible_reason,
        hotel: p.hotel_name, miles_to_stadium: h?.miles_to_stadium ?? null,
        meeting_room: h?.has_meeting_room ?? null, team_meals: p.meals.some((m) => m.source === 'hotel'),
        depart: p.departure_local, return: p.return_local, nights: p.nights,
        total: p.costs.total, bus: p.costs.bus, hotel_cost: p.costs.hotel, meals: p.costs.meals,
        risks: p.risk_flags.map((f) => ({ code: f.code, severity: f.severity })),
      };
    }),
  };
  const extra = emptyFacts();
  extra.dates.push(game.date);
  extra.times.push(game.kickoff_local);
  extra.quantities.mile = pkgs.map((p) => hotelOf(hotels, p.hotel_id)?.miles_to_stadium).filter((m): m is number => m !== undefined);
  extra.quantities.player = [req.players];
  extra.quantities.coach = [req.coaches];
  extra.quantities.staff = [req.support_staff];
  extra.money = Object.values(req.caps).filter((c): c is number => c !== null);
  return { facts, allowed: mergeFacts(factsFromPackages(pkgs), extra) };
}

/** Code ranking: feasible first, then fewest critical flags, fewest warnings, lowest total, then id. */
export function rankPackages(pkgs: TravelPackage[]): TravelPackage[] {
  return [...pkgs].sort(
    (a, b) =>
      Number(b.feasible) - Number(a.feasible) ||
      riskCount(a, 'critical') - riskCount(b, 'critical') ||
      riskCount(a, 'warning') - riskCount(b, 'warning') ||
      a.costs.total - b.costs.total ||
      (a.option_id < b.option_id ? -1 : 1),
  );
}

const clip = (s: string) => (s.length <= 120 ? s : `${s.slice(0, 117)}...`);

/** Pros/cons from code comparisons only (every number comes from the packages / hotel data). */
export function codeTradeoffs(pkgs: TravelPackage[], hotels: Hotel[] = []): Recommendation['tradeoffs'] {
  const totals = pkgs.map((p) => p.costs.total);
  const minT = Math.min(...totals);
  const maxT = Math.max(...totals);
  const priciest = pkgs.find((p) => p.costs.total === maxT);
  const miles = pkgs.map((p) => hotelOf(hotels, p.hotel_id)?.miles_to_stadium).filter((m): m is number => m !== undefined);
  const minMi = miles.length ? Math.min(...miles) : null;
  const maxMi = miles.length ? Math.max(...miles) : null;
  const arrivals = pkgs.map((p) => p.itinerary.find((i) => i.kind === 'arrive_hotel')?.start_local ?? '').filter(Boolean).sort();
  const earliest = arrivals[0];

  return pkgs.map((p) => {
    const h = hotelOf(hotels, p.hotel_id);
    const pros: string[] = [];
    const cons: string[] = [];
    const arrive = p.itinerary.find((i) => i.kind === 'arrive_hotel')?.start_local;
    if (!p.feasible) cons.push(clip(`Not feasible: ${p.infeasible_reason}`));
    if (pkgs.length > 1 && p.costs.total === minT) pros.push('Lowest total estimate');
    else if (priciest && priciest !== p) pros.push(`Saves ${formatUSD(round2(maxT - p.costs.total))} vs ${priciest.option_id}`);
    if (h && minMi !== null && miles.length > 1 && h.miles_to_stadium === minMi) pros.push(`Closest to the stadium (${h.miles_to_stadium} mi)`);
    if (p.meals.some((m) => m.source === 'hotel')) pros.push('Hotel team meals');
    if (h?.has_meeting_room) pros.push('Meeting room for position meetings');
    if (arrive && earliest && arrivals.length > 1 && arrive === earliest && arrivals[arrivals.length - 1] !== earliest) {
      pros.push(`Earliest hotel arrival (${formatDayTime(arrive)})`);
    }
    if (pkgs.length > 1 && p.costs.total === maxT && maxT !== minT) cons.push('Highest total estimate');
    if (h && maxMi !== null && miles.length > 1 && h.miles_to_stadium === maxMi && maxMi !== minMi) cons.push(`Farthest from the stadium (${h.miles_to_stadium} mi)`);
    if (p.meals.some((m) => m.over_allowance)) cons.push('Over meal allowance');
    if (p.meals.some((m) => m.dietary_gaps.length > 0)) cons.push('Some meals miss dietary needs');
    if (h && !h.has_meeting_room) cons.push('No meeting room');
    if (riskCount(p, 'critical') > 0) cons.push('Has critical risk flags');
    return { option_id: p.option_id, pros: pros.slice(0, 3), cons: cons.slice(0, 3) };
  });
}

/** Explanation that names option ids and uses only code numbers. */
export function templateExplanation(pick: TravelPackage, pkgs: TravelPackage[]): string {
  const others = pkgs.filter((p) => p !== pick);
  const feasibleOthers = others.filter((p) => p.feasible);
  const cheapest = [...pkgs].filter((p) => p.feasible).sort((a, b) => a.costs.total - b.costs.total)[0];
  const parts = [`${pick.option_id} (${pick.label}) is recommended at ${formatUSD(pick.costs.total)} estimated total${pick.hotel_name ? `, staying at ${pick.hotel_name}` : ''}.`];
  if (!pick.feasible) parts.push('No option meets the departure constraint, so this is the closest alternative. Adjust the constraint before approving.');
  else if (cheapest && cheapest !== pick) parts.push(`It costs ${formatUSD(round2(pick.costs.total - cheapest.costs.total))} more than ${cheapest.option_id} but ranks better on risk flags or readiness.`);
  else if (feasibleOthers.length) parts.push('It is the lowest-cost feasible option.');
  if (others.length) parts.push(`Others: ${others.map((p) => `${p.option_id} ${formatUSD(p.costs.total)}${p.feasible ? '' : ' (not feasible)'}`).join('; ')}.`);
  return parts.join(' ');
}

/**
 * Code-generated fallback when AI is down or the fact guard rejects the prose.
 * `opts.pick` forces the recommended option (used when the AI's id was valid but its prose was not).
 */
export function templateRecommendation(pkgs: TravelPackage[], now: string, opts: { hotels?: Hotel[]; pick?: string } = {}): Recommendation {
  const ranked = rankPackages(pkgs);
  const pick = ranked.find((p) => p.option_id === opts.pick) ?? ranked[0];
  if (!pick) throw new Error('templateRecommendation needs at least one package');
  const ranking = [pick.option_id, ...ranked.filter((p) => p !== pick).map((p) => p.option_id)];
  return {
    recommended_option_id: pick.option_id,
    ranking,
    tradeoffs: codeTradeoffs(pkgs, opts.hotels),
    explanation: templateExplanation(pick, pkgs),
    source: 'template',
    fact_guard: { passed: true, replaced: false, issues: [] },
    created_at: now,
  };
}

// ---------- A-08 / A-16 (not yet implemented) ----------

export function memoFacts(_game: Game, _req: TripRequest, _pkg: TravelPackage): { facts: unknown; allowed: AllowedFacts } {
  throw new NotImplementedError('A-08');
}
export function savingsFacts(_candidates: SavingsCandidate[], _overBy: number): { facts: unknown; allowed: AllowedFacts } {
  throw new NotImplementedError('A-16');
}

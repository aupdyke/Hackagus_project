/**
 * "Get back under budget" — task A-16. Code lists candidates (A-15) and computes every number; Aivana only picks
 * candidate IDs and explains (no dollar figures). Code verifies ids, dedupes, enforces one package change per trip,
 * recomputes the projection, and fact-guards the explanation (one retry, then a template explanation).
 * AiError → greedy template selection.
 */
import {
  AiSavingsOut, FACTS_RULE, applySavings, factGuard, formatUSD, rollupSeason, savingsCandidates, savingsFacts, savingsSchema,
  type SavingsCandidate, type SavingsResult, type SeasonRollup, type Trip,
} from '@falcon/shared';
import { generateStructured } from '../aivana/client';
import { AiError } from '../aivana/errors';
import { badRequest } from '../http';
import { pack, planning } from '../data';
import { repo } from '../repo';
import { computeTripPackages } from './planner';

export const SAVINGS_SYSTEM = [
  'You help a football travel coordinator bring the season travel budget back under the limit.',
  'From FACTS.candidates pick the smallest set of candidate IDs whose savings bring projected under budget.',
  'Prefer changes to trips later in the season and fewer roster cuts (reduce_travelers). At most one package change per trip.',
  'Explain your choice in at most 3 sentences referring to candidate IDs. Never write dollar amounts — code computes them.',
  FACTS_RULE,
].join(' ');
export const WITHIN_BUDGET = 'Season is within budget — no changes needed.';

const OK = { passed: true, replaced: false, issues: [] as string[] };
/** switch_package and cheaper_hotel both change which package a trip uses → at most one of them per trip. */
const changesPackage = (c: SavingsCandidate) => c.kind === 'switch_package' || c.kind === 'cheaper_hotel';

export function currentSeason(): { rollup: SeasonRollup; candidates: SavingsCandidate[]; trips: Trip[] } {
  const trips = repo.trips.list();
  const settings = repo.settings.get();
  return {
    trips,
    rollup: rollupSeason(trips, pack.schedule, repo.actuals.list(), settings, planning),
    candidates: savingsCandidates(trips, pack.schedule, planning, settings),
  };
}

/** Keep known ids once each, in candidate order; drop a second package change on the same trip (larger savings wins). */
export function verifySelection(ids: string[], candidates: SavingsCandidate[]): { ids: string[]; dropped: string[] } {
  const wanted = new Set(ids);
  const dropped = [...wanted].filter((id) => !candidates.some((c) => c.candidate_id === id));
  const changed = new Set<string>();
  const kept: string[] = [];
  for (const c of candidates) {
    if (!wanted.has(c.candidate_id)) continue;
    if (changesPackage(c)) {
      if (changed.has(c.trip_id)) { dropped.push(c.candidate_id); continue; }
      changed.add(c.trip_id);
    }
    kept.push(c.candidate_id);
  }
  return { ids: kept, dropped };
}

/** Greedy by savings (candidates are already sorted desc), skipping conflicts, stopping once under budget. */
export function greedySelection(rollup: SeasonRollup, candidates: SavingsCandidate[]): string[] {
  const picked: string[] = [];
  const changed = new Set<string>();
  let projected = rollup.projected;
  for (const c of candidates) {
    if (projected <= rollup.budget) break;
    if (changesPackage(c) && changed.has(c.trip_id)) continue;
    if (changesPackage(c)) changed.add(c.trip_id);
    picked.push(c.candidate_id);
    projected -= c.savings;
  }
  return picked;
}

export function templateExplanation(selected: SavingsCandidate[], projectedAfter: number, budget: number): string {
  if (!selected.length) return WITHIN_BUDGET;
  const list = selected.map((c) => `${c.candidate_id} (${c.description})`).join(', ');
  const saved = selected.reduce((s, c) => s + c.savings, 0);
  const verdict = projectedAfter <= budget ? `under the ${formatUSD(budget)} budget` : `still over the ${formatUSD(budget)} budget — consider more changes`;
  return `Selected ${list}: together about ${formatUSD(saved)} in estimated savings, bringing the projection to ${formatUSD(projectedAfter)}, ${verdict}.`;
}

function result(rollup: SeasonRollup, candidates: SavingsCandidate[], ids: string[], explanation: string, source: SavingsResult['source'], fact_guard: SavingsResult['fact_guard']): SavingsResult {
  const { projected_after, total_savings } = applySavings(rollup, candidates, ids);
  return {
    candidates, selected_candidate_ids: ids, explanation,
    projected_before: rollup.projected, projected_after, total_savings,
    back_under_budget: projected_after <= rollup.budget,
    source, fact_guard,
  };
}

export async function proposeSavings(): Promise<SavingsResult> {
  const { rollup, candidates } = currentSeason();
  if (!rollup.over_budget || !candidates.length) return result(rollup, candidates, [], WITHIN_BUDGET, 'template', OK);

  const template = () => {
    const ids = greedySelection(rollup, candidates);
    const after = applySavings(rollup, candidates, ids).projected_after;
    return { ids, text: templateExplanation(candidates.filter((c) => ids.includes(c.candidate_id)), after, rollup.budget) };
  };

  const opponents = Object.fromEntries(repo.trips.list().map((t) => [t.trip_id, pack.schedule.find((g) => g.game_id === t.game_id)?.opponent ?? t.trip_id]));
  const { facts, allowed } = savingsFacts(candidates, rollup, opponents);
  const schema = savingsSchema(candidates.map((c) => c.candidate_id));
  const base = `FACTS: ${JSON.stringify(facts)}`;
  const ask = (prompt: string) => generateStructured(schema, AiSavingsOut, { feature: 'savings', system: SAVINGS_SYSTEM, prompt, max_tokens: 400, temperature: 0.2 });

  let ai: AiSavingsOut;
  try {
    ai = (await ask(base)).data;
  } catch (e) {
    if (!(e instanceof AiError)) throw e;
    const t = template();
    return result(rollup, candidates, t.ids, t.text, 'template', OK);
  }

  let sel = verifySelection(ai.selected_candidate_ids, candidates);
  if (!sel.ids.length) {
    const t = template();
    return result(rollup, candidates, t.ids, t.text, 'template', { passed: false, replaced: true, issues: ['AI selected no valid candidates'] });
  }
  let guard = factGuard(ai.explanation, allowed);
  if (!guard.passed) {
    try {
      const retry = (await ask(`${base}\nCORRECTION: your previous answer used values not in FACTS (${guard.issues.join('; ')}). Use only FACTS and no dollar amounts.`)).data;
      const retrySel = verifySelection(retry.selected_candidate_ids, candidates);
      if (retrySel.ids.length) {
        ai = retry;
        sel = retrySel;
        guard = factGuard(ai.explanation, allowed);
      }
    } catch (e) {
      if (!(e instanceof AiError)) throw e;
    }
  }
  const issues = [...guard.issues, ...sel.dropped.map((id) => `${id} was dropped (unknown or a second package change for the same trip)`)];
  // Prose written for a different selection (code dropped some ids) would misdescribe what is applied → template prose.
  if (!guard.passed || sel.dropped.length) {
    const after = applySavings(rollup, candidates, sel.ids).projected_after;
    const text = templateExplanation(candidates.filter((c) => sel.ids.includes(c.candidate_id)), after, rollup.budget);
    return result(rollup, candidates, sel.ids, text, 'ai', { passed: false, replaced: true, issues });
  }
  return result(rollup, candidates, sel.ids, ai.explanation, 'ai', OK);
}

/**
 * Apply chosen candidates to the real trips (candidates recomputed NOW; unknown id → 400). Per trip, in order:
 * reduce_travelers (players − 5), cheaper_hotel (exclude current hotel), then switch_package (largest wins).
 * Changed approved trips go back to draft; recommendations are cleared. Returns the new season roll-up.
 */
export function applySavingsToTrips(candidateIds: string[]): SeasonRollup {
  const { candidates, trips } = currentSeason();
  const unknown = candidateIds.filter((id) => !candidates.some((c) => c.candidate_id === id));
  if (unknown.length) throw badRequest(`Unknown or no-longer-available savings candidate(s): ${unknown.join(', ')} — refresh the suggestions`);
  const chosen = candidates.filter((c) => candidateIds.includes(c.candidate_id));

  for (const tripId of [...new Set(chosen.map((c) => c.trip_id))]) {
    let trip = trips.find((t) => t.trip_id === tripId)!;
    const mine = chosen.filter((c) => c.trip_id === tripId);
    const tier = (trip.packages.find((p) => p.option_id === trip.selected_option_id) ?? trip.packages.filter((p) => p.feasible).sort((a, b) => a.costs.total - b.costs.total)[0])?.tier;
    const keepTier = (t: Trip): Trip => ({ ...t, selected_option_id: tier ? `PKG-${t.game_id}-${tier}` : t.selected_option_id });

    if (mine.some((c) => c.kind === 'reduce_travelers') && trip.request) {
      trip = keepTier(computeTripPackages({ ...trip, request: { ...trip.request, players: trip.request.players - 5 } }));
    }
    const hotel = mine.find((c) => c.kind === 'cheaper_hotel');
    if (hotel && trip.request) {
      const current = trip.packages.find((p) => p.option_id === (trip.selected_option_id ?? hotel.new_option_id));
      if (current?.hotel_id) {
        trip = keepTier(computeTripPackages({ ...trip, request: { ...trip.request, excluded_hotel_ids: [...new Set([...trip.request.excluded_hotel_ids, current.hotel_id])] } }));
      }
    }
    const sw = mine.filter((c) => c.kind === 'switch_package').sort((a, b) => b.savings - a.savings)[0];
    if (sw && trip.packages.some((p) => p.option_id === sw.new_option_id)) trip = { ...trip, selected_option_id: sw.new_option_id };

    if (trip.status === 'approved') trip = { ...trip, status: 'draft' };
    repo.trips.save({ ...trip, recommendation: null });
  }
  return currentSeason().rollup;
}

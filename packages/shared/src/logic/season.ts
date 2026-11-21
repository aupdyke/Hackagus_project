/**
 * Season roll-up + savings candidates — task A-15; budget vs actual — task A-12.
 *  committed = Σ approved/published selected totals + Σ completed (actual total if entered, else selected total)
 *  projected = committed + Σ drafts (selected, else cheapest feasible); not_started contribute 0
 *  remaining = budget − projected ; over_budget = projected > budget
 *  savings candidates (code): for each draft/approved trip — switch to each cheaper package (switch_package),
 *    reduce travelers by 5 players (reduce_travelers, recomputed through buildPackages), cheaper hotel
 *    within the same tier (cheaper_hotel). ids SAV-1.. sorted by savings desc. Never for completed/published.
 */
import type { ActualsEntry, BudgetVsActual, Game, SavingsCandidate, SeasonRollup, Settings, Trip } from '../domain';
import type { PlanningData } from './types';
import { NotImplementedError } from '../errors';
import { round2 } from './money';

export function rollupSeason(_trips: Trip[], _games: Game[], _actuals: ActualsEntry[], _settings: Settings): SeasonRollup {
  throw new NotImplementedError('A-15');
}
export function savingsCandidates(_trips: Trip[], _games: Game[], _data: PlanningData, _settings: Settings): SavingsCandidate[] {
  throw new NotImplementedError('A-15');
}
/** Apply selected candidates to compute projected-after (code-verified). */
export function applySavings(_rollup: SeasonRollup, _candidates: SavingsCandidate[], _selectedIds: string[]): { projected_after: number; total_savings: number } {
  throw new NotImplementedError('A-15');
}
/** Categories staff enter by hand after a trip (contingency is plan-only). */
export const ACTUAL_CATEGORIES = ['bus', 'equipment', 'hotel', 'meals', 'other'] as const;

/**
 * Budget vs actual (A-12). Planned numbers always come from the selected package's costs; actuals are hand-entered.
 * variance = actual − planned (positive = over plan), rounded to cents. Contingency has a plan but no actual.
 * No actual entry → every actual/variance is null. Throws if no package is selected.
 */
export function budgetVsActual(trip: Trip, actual: ActualsEntry | null): BudgetVsActual {
  const pkg = trip.packages.find((p) => p.option_id === trip.selected_option_id);
  if (!pkg) throw new Error(`Trip ${trip.trip_id} has no selected package — select one before comparing budget vs actual`);
  if (actual && actual.trip_id !== trip.trip_id) throw new Error(`Actuals for ${actual.trip_id} do not belong to ${trip.trip_id}`);
  const c = pkg.costs;
  const planned: Record<(typeof ACTUAL_CATEGORIES)[number], number> = { bus: c.bus, equipment: c.equipment, hotel: c.hotel, meals: c.meals, other: 0 };
  const lines: BudgetVsActual['lines'] = ACTUAL_CATEGORIES.map((category) => {
    const a = actual ? round2(actual[category]) : null;
    return { category, planned: round2(planned[category]), actual: a, variance: a === null ? null : round2(a - planned[category]) };
  });
  lines.push({ category: 'contingency', planned: round2(c.contingency), actual: null, variance: null });
  const actual_total = actual ? round2(ACTUAL_CATEGORIES.reduce((sum, k) => sum + actual[k], 0)) : null;
  return {
    trip_id: trip.trip_id,
    option_id: pkg.option_id,
    lines,
    planned_total: round2(c.total),
    actual_total,
    variance_total: actual_total === null ? null : round2(actual_total - c.total),
  };
}

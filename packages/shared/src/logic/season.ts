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
export function budgetVsActual(_trip: Trip, _actual: ActualsEntry | null): BudgetVsActual {
  throw new NotImplementedError('A-12');
}

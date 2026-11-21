/**
 * Package builder — task A-03. 2–3 options with stable ids `PKG-<gameId>-<A|B|C>`:
 *  A Economy:    cheapest hotel with enough rooms; cheapest meals; depart day before (afternoon)
 *  B Balanced:   best value hotel = min(total hotel cost / max(miles_to_stadium,0.5)) among those with capacity; group-friendly meals
 *  C Game-Ready: closest hotel with team meal service; hotel meals where possible; earlier departure (day before morning)
 * Honors request.excluded_hotel_ids, caps (flag `over_cap`), preference (ordering only), departure constraint
 * (infeasible → feasible=false + reason, costs still computed for comparison).
 * Same-day trips (drive ≤ 2.5h and kickoff ≥ 15:00) may produce a no-hotel Economy option.
 */
import type { Game, Settings, TravelPackage, TripRequest } from '../domain';
import type { PlanningData } from './types';
import { NotImplementedError } from '../errors';

export function buildPackages(_req: TripRequest, _game: Game, _data: PlanningData, _settings: Settings, _opts?: { seasonShare?: number }): TravelPackage[] {
  throw new NotImplementedError('A-03');
}

/** Cheapest feasible package (used by season projection). */
export function cheapestFeasible(pkgs: TravelPackage[]): TravelPackage | null {
  const feas = pkgs.filter((p) => p.feasible);
  const pool = feas.length ? feas : pkgs;
  return pool.reduce<TravelPackage | null>((best, p) => (!best || p.costs.total < best.costs.total ? p : best), null);
}

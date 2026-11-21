/**
 * Planner glue (Track A owns): request → packages → trip. Uses the shared engine; while the engine is a stub
 * (NotImplementedError) it falls back to FIXTURE packages rewritten for the game so the UI flow still works.
 */
import { NotImplementedError, buildPackages, fixtures, type Trip, type TravelPackage } from '@falcon/shared';
import { gameById, planning } from '../data';
import { repo } from '../repo';
import { notFound } from '../http';

export function fixturePackagesFor(gameId: string): TravelPackage[] {
  return fixtures.FIXTURE_PACKAGES.map((p) => JSON.parse(JSON.stringify(p).replaceAll('G10', gameId)) as TravelPackage);
}

/** Season share used for the over_season_share risk flag: budget ÷ number of away games. */
export function seasonShare(): number {
  const away = planning.schedule.filter((g) => g.home_away === 'away').length || 1;
  return repo.settings.get().season_travel_budget / away;
}

/** Recompute packages for a trip from its request (pure engine + settings). Keeps selection if it still exists. */
export function computeTripPackages(trip: Trip): Trip {
  if (!trip.request) return { ...trip, packages: [] };
  const game = gameById(trip.game_id);
  if (!game) throw notFound(`game ${trip.game_id}`);
  let packages: TravelPackage[];
  try {
    packages = buildPackages(trip.request, game, planning, repo.settings.get(), { seasonShare: seasonShare() });
  } catch (e) {
    if (!(e instanceof NotImplementedError)) throw e;
    packages = fixturePackagesFor(trip.game_id);
  }
  const selected = trip.selected_option_id && packages.some((p) => p.option_id === trip.selected_option_id) ? trip.selected_option_id : null;
  return { ...trip, packages, selected_option_id: selected };
}

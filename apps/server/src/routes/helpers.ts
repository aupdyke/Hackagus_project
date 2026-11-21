import { cheapestFeasible, type Trip, type TripSummary } from '@falcon/shared';
import { gameById } from '../data';
import { notFound } from '../http';
import { repo } from '../repo';

export function requireTrip(id: string): Trip {
  const t = repo.trips.get(id);
  if (!t) throw notFound(`trip ${id}`);
  return t;
}
export function requireGame(id: string) {
  const g = gameById(id);
  if (!g) throw notFound(`game ${id}`);
  return g;
}
export function selectedPackage(t: Trip) {
  return t.packages.find((p) => p.option_id === t.selected_option_id) ?? null;
}
export function toSummary(t: Trip): TripSummary {
  const g = requireGame(t.game_id);
  const sel = selectedPackage(t);
  const shown = sel ?? (t.status === 'draft' ? cheapestFeasible(t.packages) : null);
  return {
    trip_id: t.trip_id, game_id: t.game_id, opponent: g.opponent, city: g.city, state: g.state, date: g.date,
    kickoff_local: g.kickoff_local, status: t.status, selected_option_id: t.selected_option_id,
    selected_label: sel?.label ?? '', estimated_total: shown?.costs.total ?? null, risk_count: shown?.risk_flags.length ?? 0,
  };
}

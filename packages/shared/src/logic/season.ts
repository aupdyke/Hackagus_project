/**
 * Season roll-up + savings candidates — task A-15; budget vs actual — task A-12.
 *  committed = Σ approved/published selected totals + Σ completed (actual total if entered, else selected total)
 *  projected = committed + Σ drafts (selected, else cheapest feasible)
 *              + Σ not_started ESTIMATES (cheapest feasible package for the default request) when `data` is given
 *              (DECISIONS D-28 — the team chose this so the seeded season reads honestly before G10 is planned)
 *  remaining = budget − projected ; over_budget = projected > budget
 *  savings candidates (code): for each draft/approved trip — switch to each cheaper package (switch_package),
 *    reduce travelers by 5 players (reduce_travelers, recomputed through buildPackages), cheaper hotel
 *    within the same tier (cheaper_hotel). ids SAV-1.. sorted by savings desc. Never for completed/published.
 */
import type { ActualsEntry, BudgetVsActual, Game, SavingsCandidate, SeasonRollup, SeasonRow, Settings, TravelPackage, Trip, TripRequest } from '../domain';
import type { PlanningData } from './types';
import { buildPackages, cheapestFeasible } from './packages';
import { round2 } from './money';

/** Hand-entered actual total for a trip (bus + equipment + hotel + meals + other), or null. */
export function actualTotal(a: ActualsEntry | null | undefined): number | null {
  return a ? round2(a.bus + a.equipment + a.hotel + a.meals + a.other) : null;
}

const selectedPkg = (t: Trip): TravelPackage | null => t.packages.find((p) => p.option_id === t.selected_option_id) ?? null;
/** What a trip is planned to cost: the selected package, else (drafts only) the cheapest feasible one. */
const plannedPkg = (t: Trip): TravelPackage | null => selectedPkg(t) ?? (t.status === 'draft' ? cheapestFeasible(t.packages) : null);

/** The request staff would most likely make: everyone who travels by default, equipment truck, no constraints. */
export function defaultTripRequest(game: Game, data: Pick<PlanningData, 'roster' | 'staff'>): TripRequest {
  const players = data.roster.filter((p) => p.default_travel && p.travel_eligible).length;
  return {
    game_id: game.game_id,
    players: Math.max(1, Math.min(150, players)),
    coaches: Math.min(40, data.staff.filter((s) => s.category === 'coach' && s.travels_by_default).length),
    support_staff: Math.min(60, data.staff.filter((s) => s.category === 'support' && s.travels_by_default).length),
    departure_constraint: { kind: 'none', datetime_local: '', raw_text: '' },
    include_equipment_truck: true,
    caps: { lodging: null, meals: null, bus: null, total: null },
    excluded_hotel_ids: [], preference: 'none', notes: '',
  };
}

/** Planning estimate for a trip nobody has planned yet: cheapest feasible package for the default request. */
export function estimateUnplannedTrip(game: Game, data: PlanningData, settings: Settings): number | null {
  const pkg = cheapestFeasible(buildPackages(defaultTripRequest(game, data), game, data, settings));
  return pkg ? round2(pkg.costs.total) : null;
}

/**
 * `data` (optional) lets not_started trips count toward `projected` at their default-request estimate; without it they
 * contribute 0 (and their row shows planned_cost null).
 */
export function rollupSeason(trips: Trip[], games: Game[], actuals: ActualsEntry[], settings: Settings, data?: PlanningData): SeasonRollup {
  const gameOf = new Map(games.map((g) => [g.game_id, g]));
  const actualOf = new Map(actuals.map((a) => [a.trip_id, a]));
  const rows: SeasonRow[] = trips
    .filter((t) => gameOf.get(t.game_id)?.home_away === 'away')
    .map((t) => {
      const g = gameOf.get(t.game_id)!;
      const pkg = plannedPkg(t);
      const estimate = t.status === 'not_started' && data ? estimateUnplannedTrip(g, data, settings) : null;
      const planned = pkg ? round2(pkg.costs.total) : estimate;
      const actual = t.status === 'completed' ? actualTotal(actualOf.get(t.trip_id)) : null;
      const counts_toward: SeasonRow['counts_toward'] =
        t.status === 'draft' ? 'projected' : t.status === 'not_started' ? (estimate !== null ? 'projected' : 'none') : 'committed';
      return {
        trip_id: t.trip_id, game_id: t.game_id, opponent: g.opponent, date: g.date, status: t.status,
        selected_option_id: t.selected_option_id, selected_label: selectedPkg(t)?.label ?? '',
        planned_cost: planned, actual_cost: actual,
        variance: actual !== null && planned !== null ? round2(actual - planned) : null,
        risk_count: pkg?.risk_flags.length ?? 0,
        counts_toward,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  // committed: approved/published selected totals + completed (actual when entered, else planned)
  const committed = round2(rows.filter((r) => r.counts_toward === 'committed').reduce((s, r) => s + (r.actual_cost ?? r.planned_cost ?? 0), 0));
  const projected = round2(committed + rows.filter((r) => r.counts_toward === 'projected').reduce((s, r) => s + (r.planned_cost ?? 0), 0));
  const withActuals = rows.filter((r) => r.status === 'completed' && r.actual_cost !== null && r.planned_cost !== null);
  const plannedT = round2(withActuals.reduce((s, r) => s + r.planned_cost!, 0));
  const actualT = round2(withActuals.reduce((s, r) => s + r.actual_cost!, 0));
  return {
    budget: settings.season_travel_budget,
    committed,
    projected,
    remaining: round2(settings.season_travel_budget - projected),
    over_budget: projected > settings.season_travel_budget,
    rows,
    actuals: { trips_completed: withActuals.length, planned_total: plannedT, actual_total: actualT, variance: round2(actualT - plannedT) },
  };
}

export const REDUCE_PLAYERS_BY = 5;

/**
 * "Get back under budget" candidates, computed by code (draft + approved trips only):
 *   switch_package   — each cheaper feasible package than the current one
 *   reduce_travelers — players − 5, rebuilt, same tier
 *   cheaper_hotel    — current hotel excluded, rebuilt, same tier (only if cheaper and feasible)
 * Sorted by savings (desc, ties by trip then kind) and numbered SAV-1…
 */
export function savingsCandidates(trips: Trip[], games: Game[], data: PlanningData, settings: Settings): SavingsCandidate[] {
  const out: Omit<SavingsCandidate, 'candidate_id'>[] = [];
  for (const t of trips) {
    if ((t.status !== 'draft' && t.status !== 'approved') || !t.request) continue;
    const game = games.find((g) => g.game_id === t.game_id);
    const current = plannedPkg(t);
    if (!game || !current) continue;
    const who = game.opponent;

    for (const p of t.packages) {
      if (p.feasible && p.costs.total < current.costs.total) {
        out.push({ kind: 'switch_package', trip_id: t.trip_id, description: `${who}: switch ${current.label} → ${p.label}`, savings: round2(current.costs.total - p.costs.total), new_option_id: p.option_id });
      }
    }

    if (t.request.players - REDUCE_PLAYERS_BY >= 1) {
      const fewer = buildPackages({ ...t.request, players: t.request.players - REDUCE_PLAYERS_BY }, game, data, settings).find((p) => p.tier === current.tier);
      if (fewer && fewer.feasible && fewer.costs.total < current.costs.total) {
        out.push({ kind: 'reduce_travelers', trip_id: t.trip_id, description: `${who}: travel ${REDUCE_PLAYERS_BY} fewer players`, savings: round2(current.costs.total - fewer.costs.total), new_option_id: fewer.option_id });
      }
    }

    if (current.hotel_id) {
      const other = buildPackages({ ...t.request, excluded_hotel_ids: [...new Set([...t.request.excluded_hotel_ids, current.hotel_id])] }, game, data, settings).find((p) => p.tier === current.tier);
      if (other && other.feasible && other.hotel_id && other.costs.total < current.costs.total) {
        out.push({ kind: 'cheaper_hotel', trip_id: t.trip_id, description: `${who}: use ${other.hotel_name} instead of ${current.hotel_name}`, savings: round2(current.costs.total - other.costs.total), new_option_id: other.option_id });
      }
    }
  }
  const kindOrder = { switch_package: 0, reduce_travelers: 1, cheaper_hotel: 2 };
  return out
    .sort((a, b) => b.savings - a.savings || a.trip_id.localeCompare(b.trip_id) || kindOrder[a.kind] - kindOrder[b.kind] || a.new_option_id.localeCompare(b.new_option_id))
    .map((c, i) => ({ candidate_id: `SAV-${i + 1}`, ...c }));
}

/**
 * Apply selected candidates to compute projected-after (code-verified). Unknown ids throw. Per trip at most one
 * switch_package counts (the largest). Other savings are added independently — an approximation: e.g. 5 fewer players
 * on top of a package switch saves slightly less than listed. Callers re-plan the real trips after applying.
 */
export function applySavings(rollup: SeasonRollup, candidates: SavingsCandidate[], selectedIds: string[]): { projected_after: number; total_savings: number } {
  const byId = new Map(candidates.map((c) => [c.candidate_id, c]));
  const unknown = selectedIds.filter((id) => !byId.has(id));
  if (unknown.length) throw new Error(`Unknown savings candidate id(s): ${unknown.join(', ')}`);
  const picked = [...new Set(selectedIds)].map((id) => byId.get(id)!);
  const bestSwitch = new Map<string, SavingsCandidate>();
  for (const c of picked.filter((x) => x.kind === 'switch_package')) {
    const cur = bestSwitch.get(c.trip_id);
    if (!cur || c.savings > cur.savings) bestSwitch.set(c.trip_id, c);
  }
  const counted = picked.filter((c) => c.kind !== 'switch_package' || bestSwitch.get(c.trip_id) === c);
  const total_savings = round2(counted.reduce((s, c) => s + c.savings, 0));
  return { projected_after: round2(rollup.projected - total_savings), total_savings };
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

/**
 * Package builder — task A-03. Always three options with stable ids `PKG-<gameId>-<A|B|C>`:
 *  A Economy:    lowest total hotel cost with enough rooms; cheapest meals; depart day before (noon)
 *  B Balanced:   best value hotel = min(nightly_rate × (1+tax) + VALUE_PER_MILE × miles_to_stadium) with capacity;
 *                group-friendly meals; depart day before (noon)
 *  C Game-Ready: closest hotel with team meal service and capacity (fallback: closest with capacity);
 *                hotel meals where possible; depart day before (09:00)
 * Honors request.excluded_hotel_ids and the departure constraint (infeasible → feasible=false + reason, costs still
 * computed for comparison). Caps → over_cap flags (A-09); preference → recommendation (A-05). Neither changes A/B/C.
 */
import type { BusCompany, Game, Hotel, Settings, TravelCounts, TravelPackage, TripRequest } from '../domain';
import { NotImplementedError } from '../errors';
import type { PlanningData } from './types';
import { computeBusCost, computeCounts, computeHotelCost, computeTotals } from './cost';
import { buildItinerary, planDeparture, type DepartureStrategy } from './itinerary';
import { buildMealPlan, type MealStrategy } from './meals';
import { round2 } from './money';
import { computeRiskFlags } from './risk';
import { selectTravelingPlayers } from './travelers';

/** $ of nightly cost one mile of hotel→stadium distance is "worth" when picking the Balanced hotel (DECISIONS D-16). */
export const VALUE_PER_MILE = 8;

type Tier = TravelPackage['tier'];
const TIERS: { tier: Tier; label: TravelPackage['label']; strategy: DepartureStrategy; meals: MealStrategy }[] = [
  { tier: 'A', label: 'Economy', strategy: 'day_before_afternoon', meals: 'cheapest' },
  { tier: 'B', label: 'Balanced', strategy: 'day_before_afternoon', meals: 'group_friendly' },
  { tier: 'C', label: 'Game-Ready', strategy: 'day_before_morning', meals: 'hotel_service' },
];

const minBy = <T>(xs: T[], key: (x: T) => number, id: (x: T) => string): T | null =>
  xs.reduce<T | null>((best, x) => {
    if (!best) return x;
    const d = key(x) - key(best);
    return d < 0 || (d === 0 && id(x) < id(best)) ? x : best;
  }, null);
const hotelId = (h: Hotel) => h.hotel_id;

/** Hotel choice per tier. `hotels` = the game city's hotels minus exclusions. Null only if that list is empty. */
export function pickHotel(tier: Tier, hotels: Hotel[], counts: TravelCounts, nights: number): Hotel | null {
  if (hotels.length === 0) return null;
  const roomy = hotels.filter((h) => h.rooms_available >= counts.rooms_total);
  if (roomy.length === 0) {
    // Nobody fits: take the largest (A-09 flags insufficient_rooms).
    return minBy(hotels, (h) => -h.rooms_available, hotelId);
  }
  if (tier === 'A') return minBy(roomy, (h) => computeHotelCost(counts, h, Math.max(1, nights)), hotelId);
  if (tier === 'B') return minBy(roomy, (h) => h.nightly_rate * (1 + h.tax_rate) + VALUE_PER_MILE * h.miles_to_stadium, hotelId);
  const service = roomy.filter((h) => h.has_team_meal_service);
  return minBy(service.length ? service : roomy, (h) => h.miles_to_stadium, hotelId);
}

function busFor(data: PlanningData, settings: Settings): BusCompany {
  const bus = data.busRates.find((b) => b.company_id === settings.default_bus_company_id) ?? data.busRates[0];
  if (!bus) throw new Error('No bus companies in the data pack');
  return bus;
}

export function buildPackages(req: TripRequest, game: Game, data: PlanningData, settings: Settings, opts: { seasonShare?: number } = {}): TravelPackage[] {
  const bus = busFor(data, settings);
  const excluded = new Set(req.excluded_hotel_ids);
  const cityHotels = data.hotels.filter((h) => h.city === game.city && !excluded.has(h.hotel_id));
  const round_trip_miles = round2(2 * game.road_miles_one_way);
  const travelerDiets = selectTravelingPlayers(data.roster, req.players).map((p) => p.dietary).filter((d) => d !== 'none');
  const homeCity = `${data.team.home_city}, ${data.team.home_state}`;

  return TIERS.map(({ tier, label, strategy, meals: mealStrategy }) => {
    const plan = planDeparture(game, settings, req.departure_constraint, strategy);
    const counts = computeCounts(req, settings, bus, plan.overnight);
    const hotel = plan.overnight ? pickHotel(tier, cityHotels, counts, plan.nights) : null;

    let feasible = plan.feasible;
    let infeasible_reason = plan.infeasible_reason;
    if (plan.overnight && !hotel) {
      feasible = false;
      infeasible_reason = infeasible_reason || `No hotel available in ${game.city} (all excluded)`;
    }

    const rough = buildItinerary({ game, settings, plan, hotel, homeCity });
    const { meals, itinerary } = buildMealPlan({
      itinerary: rough, game, hotel, restaurants: data.restaurants, strategy: mealStrategy,
      headcount: counts.travelers, travelerDiets, settings,
    });

    const { bus: busCost, equipment } = computeBusCost(counts, bus, hotel, plan.trip_days, plan.nights, round_trip_miles, req.include_equipment_truck);
    const hotelCost = hotel ? computeHotelCost(counts, hotel, plan.nights) : 0;
    const mealCost = round2(meals.reduce((s, m) => s + m.cost, 0));
    const costs = computeTotals({ bus: busCost, equipment, hotel: hotelCost, meals: mealCost }, settings.contingency_pct);

    const arriveHome = itinerary.find((i) => i.kind === 'arrive_home');
    const base: Omit<TravelPackage, 'risk_flags'> = {
      option_id: `PKG-${game.game_id}-${tier}`,
      game_id: game.game_id,
      tier,
      label,
      feasible,
      infeasible_reason,
      hotel_id: hotel?.hotel_id ?? '',
      hotel_name: hotel?.name ?? '',
      bus_company_id: bus.company_id,
      departure_local: plan.departure_local,
      return_local: arriveHome?.start_local ?? plan.departure_local,
      nights: plan.nights,
      trip_days: plan.trip_days,
      round_trip_miles,
      counts,
      meals,
      costs,
      itinerary,
    };

    let risk_flags: TravelPackage['risk_flags'] = [];
    try {
      risk_flags = computeRiskFlags(base, { game, hotel, settings, request: req, seasonShare: opts.seasonShare, travelerDiets });
    } catch (e) {
      if (!(e instanceof NotImplementedError)) throw e;
    }
    return { ...base, risk_flags };
  });
}

/** Cheapest feasible package (used by season projection). */
export function cheapestFeasible(pkgs: TravelPackage[]): TravelPackage | null {
  const feas = pkgs.filter((p) => p.feasible);
  const pool = feas.length ? feas : pkgs;
  return pool.reduce<TravelPackage | null>((best, p) => (!best || p.costs.total < best.costs.total ? p : best), null);
}

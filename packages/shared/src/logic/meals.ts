/**
 * Meal plan — task A-03. For each meal item in the itinerary pick a vendor by strategy and cost it:
 *   cost = headcount × price_per_person   (headcount = travelers; drivers eat on their own per diem)
 * Flags: over_allowance when price_per_person > settings.meal_allowance_per_meal;
 *        dietary_gaps = traveler diets (≠ none) the vendor's dietary_options lack.
 * Returns meal lines AND the itinerary with meal item locations filled in.
 */
import { Dietary as DietaryEnum, type Dietary, type Game, type Hotel, type ItineraryItem, type MealKind, type MealLine, type Restaurant, type Settings } from '../domain';
import { isEnRouteMeal, mealKindOf } from './itinerary';
import { round2 } from './money';

export type MealStrategy = 'cheapest' | 'group_friendly' | 'hotel_service';

export interface MealPlanInput {
  itinerary: ItineraryItem[];
  game: Game;
  hotel: Hotel | null;
  restaurants: Restaurant[]; // all restaurants; filter by city/route_stop inside
  strategy: MealStrategy;
  headcount: number;
  travelerDiets: Dietary[]; // one entry per traveling player with a non-none diet
  settings: Settings;
}

/** Meal kinds the hotel's team meal service can cover. */
const HOTEL_SERVICE_KINDS: ReadonlySet<MealKind> = new Set(['team_dinner', 'breakfast', 'pregame_meal']);

/** Unique non-`none` diets the vendor can't serve, in a stable (enum) order. */
export function dietaryGaps(needed: Dietary[], offered: Dietary[] | 'all'): Dietary[] {
  if (offered === 'all') return [];
  const need = new Set<Dietary>(needed.filter((d) => d !== 'none'));
  return DietaryEnum.options.filter((d) => need.has(d) && !offered.includes(d));
}

const byId = (a: Restaurant, b: Restaurant) => (a.restaurant_id < b.restaurant_id ? -1 : a.restaurant_id > b.restaurant_id ? 1 : 0);

/** Pick a restaurant from `candidates` (already filtered by city) per strategy. Null if none. */
export function pickRestaurant(candidates: Restaurant[], strategy: 'cheapest' | 'group_friendly', headcount: number, diets: Dietary[]): Restaurant | null {
  if (candidates.length === 0) return null;
  const roomy = candidates.filter((r) => r.capacity >= headcount);
  let pool = roomy.length ? roomy : candidates;
  const gaps = (r: Restaurant) => dietaryGaps(diets, r.dietary_options).length;
  if (strategy === 'cheapest') {
    return [...pool].sort((a, b) => a.price_per_person - b.price_per_person || gaps(a) - gaps(b) || byId(a, b))[0]!;
  }
  const friendly = pool.filter((r) => r.group_friendly);
  pool = friendly.length ? friendly : pool;
  return [...pool].sort((a, b) => gaps(a) - gaps(b) || a.price_per_person - b.price_per_person || byId(a, b))[0]!;
}

export function buildMealPlan(input: MealPlanInput): { meals: MealLine[]; itinerary: ItineraryItem[] } {
  const { game, hotel, restaurants, strategy, headcount, travelerDiets, settings } = input;
  const cityRestaurants = restaurants.filter((r) => r.city === game.city);
  const stopRestaurants = restaurants.filter((r) => r.city === game.route_stop_city && r.route_stop);
  const meals: MealLine[] = [];

  const itinerary = input.itinerary.map((item) => {
    const kind = mealKindOf(item);
    if (!kind || item.meal_id === '') return item;
    const enRoute = isEnRouteMeal(item);

    let line: Omit<MealLine, 'meal_id' | 'kind' | 'itinerary_item_id' | 'time_local' | 'headcount' | 'cost' | 'over_allowance'>;
    let city: string;
    if (strategy === 'hotel_service' && !enRoute && hotel?.has_team_meal_service && HOTEL_SERVICE_KINDS.has(kind)) {
      line = { source: 'hotel', vendor_id: hotel.hotel_id, vendor_name: hotel.name, price_per_person: hotel.team_meal_price_pp, dietary_gaps: [] };
      city = hotel.city;
    } else {
      const r = pickRestaurant(enRoute ? stopRestaurants : cityRestaurants, strategy === 'cheapest' ? 'cheapest' : 'group_friendly', headcount, travelerDiets);
      if (r) {
        line = { source: 'restaurant', vendor_id: r.restaurant_id, vendor_name: r.name, price_per_person: r.price_per_person, dietary_gaps: dietaryGaps(travelerDiets, r.dietary_options) };
        city = r.city;
      } else {
        // No vendor in the data pack: budget at the per-meal allowance so totals stay meaningful.
        line = { source: 'restaurant', vendor_id: '', vendor_name: 'Meal allowance (no vendor listed)', price_per_person: settings.meal_allowance_per_meal, dietary_gaps: [] };
        city = enRoute ? game.route_stop_city : game.city;
      }
    }

    meals.push({
      meal_id: item.meal_id,
      kind,
      itinerary_item_id: item.id,
      time_local: item.start_local,
      headcount,
      cost: round2(headcount * line.price_per_person),
      over_allowance: line.price_per_person > settings.meal_allowance_per_meal,
      ...line,
    });
    // Only true meal items get the vendor as location; the boxed meal rides on depart_return (stadium).
    return item.kind === 'meal' ? { ...item, location: `${line.vendor_name}, ${city}` } : item;
  });

  return { meals, itinerary };
}

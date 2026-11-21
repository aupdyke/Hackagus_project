/**
 * Meal plan — task A-03. For each meal item in the itinerary pick a vendor by strategy and cost it:
 *   cost = headcount × price_per_person   (headcount = travelers; drivers eat on their own per diem)
 * Flags: over_allowance when price_per_person > settings.meal_allowance_per_meal;
 *        dietary_gaps = traveler diets (≠ none) the vendor's dietary_options lack.
 * Returns meal lines AND the itinerary with meal item locations filled in.
 */
import type { Dietary, Game, Hotel, ItineraryItem, MealLine, Restaurant, Settings } from '../domain';
import { NotImplementedError } from '../errors';

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
export function buildMealPlan(_input: MealPlanInput): { meals: MealLine[]; itinerary: ItineraryItem[] } {
  throw new NotImplementedError('A-03');
}

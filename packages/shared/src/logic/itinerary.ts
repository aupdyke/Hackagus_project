/**
 * Itinerary builder — task A-02. Works BACKWARD from kickoff and FORWARD from departure.
 * Item ids IT-1..IT-n in chronological order (these are the athlete assistant's fact ids).
 * Meal items get meal_id ML-1.. and location '' (filled by the meal plan, A-03).
 */
import type { DepartureConstraint, Game, Hotel, ItineraryItem, Settings } from '../domain';
import { NotImplementedError } from '../errors';

export type DepartureStrategy = 'day_before_afternoon' | 'day_before_morning' | 'game_day';

export interface DeparturePlan {
  feasible: boolean;
  infeasible_reason: string;
  departure_local: string; // LocalDateTime
  overnight: boolean;
  nights: number;
  trip_days: number;
}

/** Choose departure time for a strategy while honoring the staff constraint. */
export function planDeparture(_game: Game, _settings: Settings, _constraint: DepartureConstraint, _strategy: DepartureStrategy): DeparturePlan {
  throw new NotImplementedError('A-02');
}

export interface ItineraryInput {
  game: Game;
  settings: Settings;
  plan: DeparturePlan;
  hotel: Hotel | null; // null for same-day trips
  homeCity: string;
}
export function buildItinerary(_input: ItineraryInput): ItineraryItem[] {
  throw new NotImplementedError('A-02');
}

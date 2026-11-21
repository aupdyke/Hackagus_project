/**
 * Risk flags — task A-09. Code-generated, plain language. Severity guide:
 *  late_hotel_arrival        warning  arrive_hotel after settings.latest_hotel_arrival
 *  arrival_close_to_kickoff  critical arrive at destination < min_hours_arrival_before_kickoff before kickoff
 *  meal_close_to_kickoff     warning  a meal (other than post-game) ends < min_hours_meal_before_kickoff before kickoff
 *  bus_near_capacity         info     travelers > 95% of buses × seats
 *  insufficient_rooms        critical rooms_total > hotel.rooms_available
 *  meal_over_allowance       warning  meal price_per_person > meal_allowance_per_meal
 *  dietary_gap               warning  vendor lacks a needed dietary option
 *  over_season_share         warning  total > seasonShare (budget ÷ away games) when provided
 *  infeasible_departure      critical departure constraint cannot be met
 *  over_cap                  warning  a category exceeds request.caps
 */
import type { Game, Hotel, RiskFlag, Settings, TravelPackage, TripRequest } from '../domain';
import { NotImplementedError } from '../errors';

export function computeRiskFlags(_pkg: Omit<TravelPackage, 'risk_flags'>, _ctx: { game: Game; hotel: Hotel | null; settings: Settings; request: TripRequest; seasonShare?: number }): RiskFlag[] {
  throw new NotImplementedError('A-09');
}

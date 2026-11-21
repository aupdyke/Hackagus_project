/**
 * Cost engine primitives — task A-01. Pure, deterministic, unit tested (cost.test.ts).
 *
 *   travelers = players + coaches + support            (drivers counted separately, lodging only)
 *   seats     = settings.seats_per_bus_override ?? bus.seats_per_bus
 *   buses     = ceil(travelers / seats)
 *   drivers   = buses (+1 if equipment truck)          (driver rooms only when overnight && bus.driver_room_required_overnight)
 *   bus_cost  = buses × (daily_rate × trip_days + per_mile_rate × round_trip_miles) + driver_rooms × hotel.nightly_rate × nights × (1+tax)
 *   equipment = truck ? equipment_truck_daily_rate × trip_days + equipment_truck_per_mile_rate × round_trip_miles : 0
 *   rooms     = ceil(players/player_occ) + ceil(coaches/coach_occ) + ceil(support/support_occ) + driver_rooms
 *   hotel     = (rooms − driver_rooms) × nightly_rate × nights × (1 + tax_rate)      (driver rooms are billed in bus_cost)
 *   subtotal  = bus + equipment + hotel + meals ; contingency = subtotal × contingency_pct/100 ; total = subtotal + contingency
 * All outputs rounded to cents with round2.
 */
import type { BusCompany, CostBreakdown, Hotel, Settings, TravelCounts, TripRequest } from '../domain';
import { NotImplementedError } from '../errors';

export function computeCounts(_req: Pick<TripRequest, 'players' | 'coaches' | 'support_staff' | 'include_equipment_truck'>, _settings: Settings, _bus: BusCompany, _overnight: boolean): TravelCounts {
  throw new NotImplementedError('A-01');
}

export function computeBusCost(_counts: TravelCounts, _bus: BusCompany, _hotel: Hotel | null, _tripDays: number, _nights: number, _roundTripMiles: number, _includeTruck: boolean): { bus: number; equipment: number } {
  throw new NotImplementedError('A-01');
}

export function computeHotelCost(_counts: TravelCounts, _hotel: Hotel, _nights: number): number {
  throw new NotImplementedError('A-01');
}

export function computeTotals(_parts: { bus: number; equipment: number; hotel: number; meals: number }, _contingencyPct: number): CostBreakdown {
  throw new NotImplementedError('A-01');
}

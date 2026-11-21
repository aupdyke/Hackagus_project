/**
 * Cost engine primitives — task A-01. Pure, deterministic, unit tested (cost.test.ts).
 *
 *   travelers = players + coaches + support            (drivers counted separately, lodging only)
 *   seats     = settings.seats_per_bus_override ?? bus.seats_per_bus
 *   buses     = max(1, ceil(travelers / seats))
 *   drivers   = buses (+1 if equipment truck)          (driver rooms only when overnight && bus.driver_room_required_overnight)
 *   bus_cost  = buses × (daily_rate × trip_days + per_mile_rate × round_trip_miles) + driver_rooms × hotel.nightly_rate × nights × (1+tax)
 *   equipment = truck ? equipment_truck_daily_rate × trip_days + equipment_truck_per_mile_rate × round_trip_miles : 0
 *   rooms     = ceil(players/player_occ) + ceil(coaches/coach_occ) + ceil(support/support_occ) + driver_rooms
 *   hotel     = (rooms − driver_rooms) × nightly_rate × nights × (1 + tax_rate)      (driver rooms are billed in bus_cost)
 *   subtotal  = bus + equipment + hotel + meals ; contingency = subtotal × contingency_pct/100 ; total = subtotal + contingency
 * All outputs rounded to cents with round2.
 */
import type { BusCompany, CostBreakdown, Hotel, Settings, TravelCounts, TripRequest } from '../domain';
import { round2 } from './money';

/** Cost of `rooms` hotel rooms for `nights` nights, tax included (unrounded). */
const roomNights = (rooms: number, hotel: Hotel, nights: number) =>
  rooms * hotel.nightly_rate * Math.max(0, nights) * (1 + hotel.tax_rate);

export function computeCounts(
  req: Pick<TripRequest, 'players' | 'coaches' | 'support_staff' | 'include_equipment_truck'>,
  settings: Settings,
  bus: BusCompany,
  overnight: boolean,
): TravelCounts {
  const players = req.players;
  const coaches = req.coaches;
  const support = req.support_staff;
  const travelers = players + coaches + support;
  const seats_per_bus = settings.seats_per_bus_override ?? bus.seats_per_bus;
  const buses = Math.max(1, Math.ceil(travelers / seats_per_bus));
  const drivers = buses + (req.include_equipment_truck ? 1 : 0);
  const rooms_drivers = overnight && bus.driver_room_required_overnight ? drivers : 0;
  const rooms_players = Math.ceil(players / settings.player_room_occupancy);
  const rooms_coaches = Math.ceil(coaches / settings.coach_room_occupancy);
  const rooms_support = Math.ceil(support / settings.support_room_occupancy);
  return {
    players, coaches, support, travelers, drivers, buses, seats_per_bus,
    rooms_players, rooms_coaches, rooms_support, rooms_drivers,
    rooms_total: rooms_players + rooms_coaches + rooms_support + rooms_drivers,
  };
}

export function computeBusCost(
  counts: TravelCounts,
  bus: BusCompany,
  hotel: Hotel | null,
  tripDays: number,
  nights: number,
  roundTripMiles: number,
  includeTruck: boolean,
): { bus: number; equipment: number } {
  const coaches = counts.buses * (bus.daily_rate * tripDays + bus.per_mile_rate * roundTripMiles);
  const driverRooms = hotel ? roomNights(counts.rooms_drivers, hotel, nights) : 0;
  const equipment = includeTruck
    ? bus.equipment_truck_daily_rate * tripDays + bus.equipment_truck_per_mile_rate * roundTripMiles
    : 0;
  return { bus: round2(coaches + driverRooms), equipment: round2(equipment) };
}

export function computeHotelCost(counts: TravelCounts, hotel: Hotel, nights: number): number {
  return round2(roomNights(counts.rooms_total - counts.rooms_drivers, hotel, nights));
}

export function computeTotals(
  parts: { bus: number; equipment: number; hotel: number; meals: number },
  contingencyPct: number,
): CostBreakdown {
  const bus = round2(parts.bus);
  const equipment = round2(parts.equipment);
  const hotel = round2(parts.hotel);
  const meals = round2(parts.meals);
  const subtotal = round2(bus + equipment + hotel + meals);
  const contingency = round2((subtotal * contingencyPct) / 100);
  return { bus, equipment, hotel, meals, subtotal, contingency, total: round2(subtotal + contingency) };
}

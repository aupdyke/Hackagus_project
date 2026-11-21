/**
 * Risk flags — task A-09. Code-generated, plain language. Severity guide:
 *  late_hotel_arrival        warning  arrive_hotel after settings.latest_hotel_arrival (on the departure day, or any later day)
 *  arrival_close_to_kickoff  critical arrive at destination < min_hours_arrival_before_kickoff before kickoff
 *  meal_close_to_kickoff     warning  a meal (other than post-game) ends < min_hours_meal_before_kickoff (+30 min) before kickoff
 *  bus_near_capacity         info     travelers > 95% of buses × seats
 *  insufficient_rooms        critical rooms_total > hotel.rooms_available
 *  meal_over_allowance       warning  meal price_per_person > meal_allowance_per_meal (one flag listing the meals)
 *  dietary_gap               warning  vendor lacks a needed dietary option (one per meal, with travelers affected)
 *  over_season_share         warning  total > seasonShare (budget ÷ away games) when provided
 *  infeasible_departure      critical departure constraint cannot be met
 *  over_cap                  warning  a category exceeds request.caps
 * Sorted critical → warning → info. Messages contain only code-formatted values.
 */
import type { Dietary, Game, Hotel, ItineraryItem, RiskFlag, Settings, TravelPackage, TripRequest } from '../domain';
import { mealKindOf } from './itinerary';
import { formatUSD } from './money';
import { combine, datePart, formatClock, formatDayTime, hoursBetween, isBefore } from './time';

export interface RiskContext {
  game: Game;
  hotel: Hotel | null;
  settings: Settings;
  request: TripRequest;
  seasonShare?: number;
  /** one entry per traveling player with a non-none diet (for "N travelers affected") */
  travelerDiets?: Dietary[];
}

const SEVERITY_ORDER: Record<RiskFlag['severity'], number> = { critical: 0, warning: 1, info: 2 };
/** Extra margin past a kickoff minimum that still earns a "close to" warning. */
export const MEAL_MARGIN_H = 0.5;
export const BUS_NEAR_CAPACITY = 0.95;

const DIET_LABEL: Record<Dietary, string> = { none: 'standard', vegetarian: 'vegetarian', gluten_free: 'gluten-free', nut_allergy: 'nut-allergy' };
/** 3.25 → "3.25", 1.5 → "1.5", 3 → "3" */
const fmtHours = (h: number) => String(Math.round(h * 100) / 100);
const hourWord = (h: number) => `${fmtHours(h)} hour${h === 1 ? '' : 's'}`;
const listJoin = (xs: string[], word = 'and') => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${word} ${xs.at(-1)}`);
/** "3-hour minimum" */
const minimumWord = (h: number) => `${fmtHours(h)}-hour minimum`;
/** Human meal name: the itinerary label, except the boxed meal that rides on the depart_return item. */
const mealName = (item: ItineraryItem | undefined, kind: string) =>
  kind === 'postgame_boxed' ? 'Post-game boxed meal' : item?.label ?? kind.replaceAll('_', ' ');

export function computeRiskFlags(pkg: Omit<TravelPackage, 'risk_flags'>, ctx: RiskContext): RiskFlag[] {
  const { game, hotel, settings, request } = ctx;
  const flags: RiskFlag[] = [];
  const add = (code: RiskFlag['code'], severity: RiskFlag['severity'], message: string, related_item_id = '') =>
    flags.push({ code, severity, message, option_id: pkg.option_id, related_item_id });
  const kickoff = combine(game.date, game.kickoff_local);
  const find = (kind: ItineraryItem['kind']) => pkg.itinerary.find((i) => i.kind === kind);
  const itemById = (id: string) => pkg.itinerary.find((i) => i.id === id);

  // infeasible_departure
  if (!pkg.feasible) add('infeasible_departure', 'critical', pkg.infeasible_reason || 'This option cannot meet the departure constraint.', find('depart')?.id ?? '');

  // late_hotel_arrival
  const arriveHotel = find('arrive_hotel');
  if (arriveHotel) {
    const limit = combine(datePart(pkg.departure_local), settings.latest_hotel_arrival);
    if (isBefore(limit, arriveHotel.start_local)) {
      const when = datePart(arriveHotel.start_local) === datePart(pkg.departure_local) ? formatClock(arriveHotel.start_local) : formatDayTime(arriveHotel.start_local);
      add('late_hotel_arrival', 'warning', `Arrives at hotel ${when} — after the ${formatClock(settings.latest_hotel_arrival)} latest arrival setting.`, arriveHotel.id);
    }
  }

  // arrival_close_to_kickoff (destination = hotel for overnight trips, stadium for same-day)
  const arrival = arriveHotel ?? find('arrive_stadium');
  if (arrival) {
    const h = hoursBetween(arrival.start_local, kickoff);
    const min = settings.min_hours_arrival_before_kickoff;
    if (h < min) {
      add('arrival_close_to_kickoff', 'critical', `Arrives ${formatDayTime(arrival.start_local)} — only ${hourWord(Math.max(0, h))} before kickoff (minimum ${hourWord(min)}).`, arrival.id);
    }
  }

  // meal_close_to_kickoff
  const minMeal = settings.min_hours_meal_before_kickoff;
  for (const item of pkg.itinerary) {
    const kind = mealKindOf(item);
    if (!kind || kind === 'postgame_boxed' || !item.end_local) continue;
    const h = hoursBetween(item.end_local, kickoff);
    if (h < 0 || h >= minMeal + MEAL_MARGIN_H) continue;
    const msg = h < minMeal
      ? `${item.label} ends ${hourWord(h)} before kickoff — under the ${minimumWord(minMeal)}.`
      : `${item.label} ends ${hourWord(h)} before kickoff — close to the ${minimumWord(minMeal)}.`;
    add('meal_close_to_kickoff', 'warning', msg, item.id);
  }

  // bus_near_capacity
  const seats = pkg.counts.buses * pkg.counts.seats_per_bus;
  if (seats > 0 && pkg.counts.travelers > BUS_NEAR_CAPACITY * seats) {
    const pct = Math.round((pkg.counts.travelers / seats) * 100);
    add('bus_near_capacity', 'info', `Buses are ${pct}% full (${pkg.counts.travelers} travelers, ${seats} seats).`);
  }

  // insufficient_rooms
  if (hotel && pkg.counts.rooms_total > hotel.rooms_available) {
    add('insufficient_rooms', 'critical', `Needs ${pkg.counts.rooms_total} rooms but ${hotel.name} has only ${hotel.rooms_available} available.`, arriveHotel?.id ?? '');
  }

  // meal_over_allowance (one flag per package)
  const over = pkg.meals.filter((m) => m.over_allowance);
  if (over.length) {
    const names = over.map((m) => `${mealName(itemById(m.itinerary_item_id), m.kind)} (${formatUSD(m.price_per_person)} per person)`);
    add('meal_over_allowance', 'warning', `${listJoin(names)} ${over.length === 1 ? 'is' : 'are'} over the ${formatUSD(settings.meal_allowance_per_meal)} meal allowance.`, over[0]!.itinerary_item_id);
  }

  // dietary_gap (one per meal)
  for (const m of pkg.meals) {
    if (!m.dietary_gaps.length) continue;
    const label = mealName(itemById(m.itinerary_item_id), m.kind);
    const diets = listJoin(m.dietary_gaps.map((d) => DIET_LABEL[d]), 'or');
    const affected = ctx.travelerDiets ? ctx.travelerDiets.filter((d) => m.dietary_gaps.includes(d)).length : null;
    const who = affected === null ? 'travelers with these needs need another option' : `${affected} traveler${affected === 1 ? '' : 's'} affected`;
    add('dietary_gap', 'warning', `${label} at ${m.vendor_name} has no ${diets} option — ${who}.`, m.itinerary_item_id);
  }

  // over_season_share
  if (ctx.seasonShare !== undefined && ctx.seasonShare > 0 && pkg.costs.total > ctx.seasonShare) {
    add('over_season_share', 'warning', `Total ${formatUSD(pkg.costs.total)} is over the per-trip season share of ${formatUSD(ctx.seasonShare)}.`);
  }

  // over_cap
  const caps = request.caps;
  const capChecks: [keyof typeof caps, string, number][] = [
    ['lodging', 'Lodging', pkg.costs.hotel],
    ['meals', 'Meals', pkg.costs.meals],
    ['bus', 'Bus and equipment', pkg.costs.bus + pkg.costs.equipment],
    ['total', 'Total', pkg.costs.total],
  ];
  for (const [key, label, value] of capChecks) {
    const cap = caps[key];
    if (cap !== null && value > cap) add('over_cap', 'warning', `${label} ${formatUSD(value)} is over the ${formatUSD(cap)} cap.`);
  }

  return flags
    .map((f, i) => ({ f, i }))
    .sort((a, b) => SEVERITY_ORDER[a.f.severity] - SEVERITY_ORDER[b.f.severity] || a.i - b.i)
    .map((x) => x.f);
}

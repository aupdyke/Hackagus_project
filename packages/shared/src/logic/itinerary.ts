/**
 * Itinerary builder — task A-02. Works BACKWARD from kickoff and FORWARD from departure.
 * Item ids IT-1..IT-n in chronological order (these are the athlete assistant's fact ids).
 * Meal items get meal_id ML-1.. and location '' (filled by the meal plan, A-03).
 * Pure and deterministic: all times are naive local strings handled by logic/time.ts.
 */
import type { DepartureConstraint, Game, Hotel, ItineraryItem, ItineraryKind, MealKind, Settings } from '../domain';
import { addMinutes, clockPart, combine, datePart, formatClock, formatDayTime, hoursBetween, isBefore, minutesOfDay } from './time';

export type DepartureStrategy = 'day_before_afternoon' | 'day_before_morning' | 'game_day';

export interface DeparturePlan {
  feasible: boolean;
  infeasible_reason: string;
  departure_local: string; // LocalDateTime
  overnight: boolean;
  nights: number;
  trip_days: number;
}

// ---------- small exported helpers (used by A-03 / A-09) ----------

/** Round minutes up to the next multiple of 5. */
export const ceil5 = (min: number) => Math.ceil(min / 5 - 1e-9) * 5;

/** One-way bus drive in minutes: the slower of the listed drive time and miles at avg_bus_mph, rounded up to 5. */
export const driveMinutes = (game: Game, settings: Settings) =>
  ceil5(Math.max(game.drive_hours_one_way * 60, (game.road_miles_one_way / settings.avg_bus_mph) * 60));

/** Hotel → stadium bus transfer at 25 mph, rounded up to 5 min. */
export const transferMinutes = (hotel: Hotel) => ceil5((hotel.miles_to_stadium / 25) * 60);

/** Same-day travel is only offered for short drives and afternoon kickoffs. */
export const SAME_DAY_MAX_DRIVE_MIN = 150;
export const SAME_DAY_MIN_KICKOFF = '15:00';
export const sameDayEligible = (game: Game, settings: Settings) =>
  driveMinutes(game, settings) <= SAME_DAY_MAX_DRIVE_MIN && minutesOfDay(game.kickoff_local) >= minutesOfDay(SAME_DAY_MIN_KICKOFF);

export const HOME_LOCATION_PREFIX = 'BGSU Football Complex';

export interface EnRouteStop {
  /** minutes after departure the stop begins */
  offset_min: number;
  minutes: number;
  start_local: string;
  /** null for a plain rest stop */
  meal: MealKind | null;
  label: string;
  location: string;
}
export interface OutboundLeg {
  drive_min: number;
  stop: EnRouteStop | null;
  /** departure + drive + stop + departure_buffer_min */
  arrival_local: string;
}

const STOP_MEAL_MIN = 45;
const REST_STOP_MIN = 20;
const inWindow = (clock: string, from: string, to: string) => {
  const m = minutesOfDay(clock);
  return m >= minutesOfDay(from) && m <= minutesOfDay(to);
};

/** Outbound timing for a given departure: optional mid-drive stop and arrival at the destination city. */
export function outboundLeg(game: Game, settings: Settings, departure: string): OutboundLeg {
  const drive_min = driveMinutes(game, settings);
  let stop: EnRouteStop | null = null;
  if (game.route_stop_city !== '' || drive_min >= 150) {
    const offset_min = ceil5(drive_min / 2);
    const start_local = addMinutes(departure, offset_min);
    const clock = clockPart(start_local);
    const hasCity = game.route_stop_city !== '';
    if (hasCity && inWindow(clock, '11:00', '14:59')) {
      stop = { offset_min, minutes: STOP_MEAL_MIN, start_local, meal: 'en_route_lunch', label: 'En-route lunch', location: '' };
    } else if (hasCity && inWindow(clock, '17:00', '20:00')) {
      stop = { offset_min, minutes: STOP_MEAL_MIN, start_local, meal: 'team_dinner', label: 'Team dinner (en route)', location: '' };
    } else {
      stop = { offset_min, minutes: REST_STOP_MIN, start_local, meal: null, label: 'Rest stop', location: hasCity ? game.route_stop_city : 'En route' };
    }
  }
  const arrival_local = addMinutes(departure, drive_min + (stop?.minutes ?? 0) + settings.departure_buffer_min);
  return { drive_min, stop, arrival_local };
}

const daysBetween = (a: string, b: string) => Math.round(hoursBetween(`${datePart(a)}T00:00`, `${datePart(b)}T00:00`) / 24);
const later = (a: string, b: string) => (isBefore(a, b) ? b : a);
const earlier = (a: string, b: string) => (isBefore(a, b) ? a : b);

// ---------- departure ----------

/** Choose departure time for a strategy while honoring the staff constraint. */
export function planDeparture(game: Game, settings: Settings, constraint: DepartureConstraint, strategy: DepartureStrategy): DeparturePlan {
  const kickoff = combine(game.date, game.kickoff_local);
  const dayBefore = datePart(addMinutes(`${game.date}T00:00`, -24 * 60));
  const minArriveH = settings.min_hours_arrival_before_kickoff;
  const latestArrival = addMinutes(kickoff, -minArriveH * 60);

  let def: string;
  if (strategy === 'day_before_afternoon') def = combine(dayBefore, '12:00');
  else if (strategy === 'day_before_morning') def = combine(dayBefore, '09:00');
  else {
    // Back off from the latest allowed arrival. The stop (if any) depends on the departure time, so settle it in two passes.
    const base = addMinutes(latestArrival, -(driveMinutes(game, settings) + settings.departure_buffer_min));
    const stopMin = outboundLeg(game, settings, base).stop?.minutes ?? 0;
    def = addMinutes(base, -stopMin);
    const stopMin2 = outboundLeg(game, settings, def).stop?.minutes ?? 0;
    if (stopMin2 !== stopMin) def = addMinutes(base, -stopMin2);
  }

  const T = constraint.datetime_local;
  let departure = def;
  if (T !== '' && constraint.kind === 'not_before') departure = later(def, T);
  else if (T !== '' && constraint.kind === 'not_after') departure = earlier(def, T);

  const overnight = strategy !== 'game_day';
  const daysOut = daysBetween(departure, game.date);
  const nights = overnight ? Math.max(1, daysOut) : 0;
  const trip_days = Math.max(1, daysOut + 1);

  let infeasible_reason = '';
  if (strategy === 'game_day' && !sameDayEligible(game, settings)) {
    infeasible_reason = `Same-day travel needs a drive of 2.5 h or less and a kickoff at ${formatClock(SAME_DAY_MIN_KICKOFF)} or later`;
  } else {
    const arrival = outboundLeg(game, settings, departure).arrival_local;
    if (isBefore(latestArrival, arrival)) {
      infeasible_reason =
        T !== '' && constraint.kind === 'not_before' && departure === T
          ? `Can't leave before ${formatDayTime(T)} and still arrive ${minArriveH} h before kickoff`
          : `Departing ${formatDayTime(departure)} arrives ${formatDayTime(arrival)}, less than ${minArriveH} h before kickoff`;
    }
  }

  return { feasible: infeasible_reason === '', infeasible_reason, departure_local: departure, overnight, nights, trip_days };
}

// ---------- itinerary ----------

export interface ItineraryInput {
  game: Game;
  settings: Settings;
  plan: DeparturePlan;
  hotel: Hotel | null; // null for same-day trips
  /** e.g. "Bowling Green, OH" → location "BGSU Football Complex, Bowling Green, OH" */
  homeCity: string;
}

/** Fixed labels; `mealKindOf` maps them back to a MealKind for the meal plan (A-03). */
export const MEAL_LABELS: Record<string, MealKind> = {
  'En-route lunch': 'en_route_lunch',
  'Team dinner (en route)': 'team_dinner',
  'Team dinner': 'team_dinner',
  Breakfast: 'breakfast',
  'Pre-game meal': 'pregame_meal',
};
export const RETURN_LABEL = 'Buses depart for home (boxed meal on bus)';

/** MealKind for an itinerary item that carries a meal (meal items + the depart_return boxed meal), else null. */
export function mealKindOf(item: Pick<ItineraryItem, 'kind' | 'label' | 'meal_id'>): MealKind | null {
  if (item.kind === 'depart_return') return item.meal_id !== '' ? 'postgame_boxed' : null;
  if (item.kind !== 'meal') return null;
  return MEAL_LABELS[item.label] ?? null;
}

type Draft = { kind: ItineraryKind; label: string; start: string; end: string; location: string; meal: boolean };

export function buildItinerary({ game, settings, plan, hotel, homeCity }: ItineraryInput): ItineraryItem[] {
  const home = homeCity ? `${HOME_LOCATION_PREFIX}, ${homeCity}` : HOME_LOCATION_PREFIX;
  const stadium = game.stadium_name;
  const hotelName = hotel?.name ?? 'Hotel';
  const kickoff = combine(game.date, game.kickoff_local);
  const leg = outboundLeg(game, settings, plan.departure_local);
  const drafts: Draft[] = [];
  const add = (kind: ItineraryKind, label: string, start: string, end: string, location: string, meal = false) =>
    drafts.push({ kind, label, start, end, location, meal });

  // Outbound
  add('depart', 'Buses depart', plan.departure_local, '', home);
  if (leg.stop) {
    const s = leg.stop;
    add(s.meal ? 'meal' : 'stop', s.label, s.start_local, addMinutes(s.start_local, s.minutes), s.location, s.meal !== null);
  }
  const dinnerEnRoute = leg.stop?.meal === 'team_dinner';

  if (plan.overnight) {
    const arrival = leg.arrival_local;
    const arrivalDate = datePart(arrival);
    const checkinEnd = addMinutes(arrival, 30);
    add('arrive_hotel', 'Arrive at hotel', arrival, '', hotelName);
    add('checkin', 'Hotel check-in', arrival, checkinEnd, hotelName);
    let lastEnd = checkinEnd;

    // Evening block only when the team arrives before game day.
    if (arrivalDate < game.date) {
      let walkEnd = '';
      if (!isBefore(combine(arrivalDate, '18:00'), checkinEnd)) {
        const walkStart = addMinutes(checkinEnd, 30);
        walkEnd = addMinutes(walkStart, 60);
        add('walkthrough', 'Stadium walkthrough', walkStart, walkEnd, stadium);
        lastEnd = walkEnd;
      }
      if (!dinnerEnRoute) {
        // Later of 18:30 or check-in + 30; also after the walkthrough (+30 to get back) so they never overlap.
        let dinnerStart = later(combine(arrivalDate, '18:30'), addMinutes(checkinEnd, 30));
        if (walkEnd) dinnerStart = later(dinnerStart, addMinutes(walkEnd, 30));
        if (!isBefore(combine(arrivalDate, '21:00'), dinnerStart)) {
          const dinnerEnd = addMinutes(dinnerStart, 60);
          add('meal', 'Team dinner', dinnerStart, dinnerEnd, '', true);
          lastEnd = later(lastEnd, dinnerEnd);
        }
      }
      const meetingStart = combine(arrivalDate, '20:00');
      if (!isBefore(meetingStart, lastEnd)) add('meeting', 'Position meetings', meetingStart, combine(arrivalDate, '21:30'), hotelName);
      add('curfew', 'Curfew / lights out', later(combine(arrivalDate, '22:30'), addMinutes(arrival, 60)), '', hotelName);
    }

    // Game day (items that would fall before check-in ends are dropped, e.g. a game-morning arrival).
    const gameDay: Draft[] = [];
    const push = (kind: ItineraryKind, label: string, start: string, end: string, location: string, meal = false) =>
      gameDay.push({ kind, label, start, end, location, meal });
    if (minutesOfDay(game.kickoff_local) >= minutesOfDay('15:00')) {
      push('meal', 'Breakfast', combine(game.date, '08:30'), combine(game.date, '09:15'), '', true);
    }
    const pregameEnd = addMinutes(kickoff, -(settings.min_hours_meal_before_kickoff * 60 + 15));
    push('meal', 'Pre-game meal', addMinutes(pregameEnd, -45), pregameEnd, '', true);
    const arriveStadium = addMinutes(kickoff, -150);
    const transfer = hotel ? transferMinutes(hotel) : 0;
    push('depart_hotel', 'Buses depart hotel', addMinutes(arriveStadium, -(transfer + 10)), '', hotelName);
    push('arrive_stadium', 'Arrive at stadium', arriveStadium, '', stadium);
    for (const d of gameDay) if (!isBefore(d.start, lastEnd)) drafts.push(d);
  } else {
    add('arrive_stadium', 'Arrive at stadium', leg.arrival_local, '', stadium);
  }

  add('kickoff', `Kickoff vs ${game.opponent}`, kickoff, '', stadium);
  const departReturn = addMinutes(kickoff, 240);
  add('depart_return', RETURN_LABEL, departReturn, '', stadium, true);
  add('arrive_home', 'Arrive home', addMinutes(departReturn, leg.drive_min + settings.departure_buffer_min), '', home);

  // Sort chronologically (stable: equal starts keep insertion order), then assign ids.
  const sorted = drafts
    .map((d, i) => ({ d, i }))
    .sort((a, b) => (a.d.start < b.d.start ? -1 : a.d.start > b.d.start ? 1 : a.i - b.i))
    .map((x) => x.d);
  let ml = 0;
  return sorted.map((d, idx) => ({
    id: `IT-${idx + 1}`,
    kind: d.kind,
    label: d.label,
    start_local: d.start,
    end_local: d.end,
    location: d.location,
    meal_id: d.meal ? `ML-${++ml}` : '',
  }));
}

import { describe, expect, it } from 'vitest';
import { loadDataPack } from '../testing/loadData';
import { ItineraryItem, type DepartureConstraint, type Game } from '../domain';
import { buildItinerary, driveMinutes, mealKindOf, outboundLeg, planDeparture, transferMinutes, type DepartureStrategy } from './itinerary';

const pack = loadDataPack();
const settings = pack.settings;
const game = (id: string) => pack.schedule.find((g) => g.game_id === id)!;
const hotel = (id: string) => pack.hotels.find((h) => h.hotel_id === id)!;
const NONE: DepartureConstraint = { kind: 'none', datetime_local: '', raw_text: '' };
const notBefore = (t: string): DepartureConstraint => ({ kind: 'not_before', datetime_local: t, raw_text: '' });
const notAfter = (t: string): DepartureConstraint => ({ kind: 'not_after', datetime_local: t, raw_text: '' });
const HOME = 'Bowling Green, OH';

function build(g: Game, strategy: DepartureStrategy, hotelId: string | null, c = NONE) {
  const plan = planDeparture(g, settings, c, strategy);
  const items = buildItinerary({ game: g, settings, plan, hotel: hotelId ? hotel(hotelId) : null, homeCity: HOME });
  return { plan, items };
}
const at = (items: ItineraryItem[], kind: ItineraryItem['kind']) => items.filter((i) => i.kind === kind);
const one = (items: ItineraryItem[], kind: ItineraryItem['kind']) => {
  const found = at(items, kind);
  expect(found, kind).toHaveLength(1);
  return found[0]!;
};

function expectWellFormed(items: ItineraryItem[]) {
  for (const i of items) ItineraryItem.parse(i);
  items.forEach((i, idx) => expect(i.id).toBe(`IT-${idx + 1}`));
  for (let k = 1; k < items.length; k++) expect(items[k]!.start_local >= items[k - 1]!.start_local).toBe(true);
  const mealIds = items.filter((i) => i.meal_id !== '').map((i) => i.meal_id);
  expect(new Set(mealIds).size).toBe(mealIds.length);
  mealIds.forEach((m, idx) => expect(m).toBe(`ML-${idx + 1}`));
  for (const i of items.filter((x) => x.meal_id !== '')) expect(mealKindOf(i)).not.toBeNull();
}

describe('helpers', () => {
  it('drive minutes = ceil5(max(listed hours, miles / mph))', () => {
    expect(driveMinutes(game('G10'), settings)).toBe(220); // max(216, 218.2) → 220
    expect(driveMinutes(game('G12'), settings)).toBe(325); // max(282, 321.8) → 325
  });
  it('hotel transfer at 25 mph', () => {
    expect(transferMinutes(hotel('H-ATH-1'))).toBe(25); // 9.11 mi → 21.9 min
    expect(transferMinutes(hotel('H-BUF-1'))).toBe(35); // 13.3 mi → 31.9 min
  });
  it('G10 noon departure: lunch stop at the midpoint, arrival = dep + drive + stop + buffer', () => {
    const leg = outboundLeg(game('G10'), settings, '2026-11-27T12:00');
    expect(leg.stop).toMatchObject({ start_local: '2026-11-27T13:50', minutes: 45, meal: 'en_route_lunch' });
    expect(leg.arrival_local).toBe('2026-11-27T16:55'); // 12:00 + 220 + 45 + 30
  });
});

describe('planDeparture', () => {
  it('G10 day_before_afternoon, no constraint → Fri 12:00, 1 night, 2 days', () => {
    expect(planDeparture(game('G10'), settings, NONE, 'day_before_afternoon')).toEqual({
      feasible: true, infeasible_reason: '', departure_local: '2026-11-27T12:00', overnight: true, nights: 1, trip_days: 2,
    });
  });
  it('day_before_morning → day before 09:00', () => {
    expect(planDeparture(game('G12'), settings, NONE, 'day_before_morning').departure_local).toBe('2026-12-11T09:00');
  });
  it('not_before Fri 14:00 → departs 14:00', () => {
    const p = planDeparture(game('G10'), settings, notBefore('2026-11-27T14:00'), 'day_before_afternoon');
    expect(p.departure_local).toBe('2026-11-27T14:00');
    expect(p.feasible).toBe(true);
  });
  it('not_before earlier than default keeps the default', () => {
    expect(planDeparture(game('G10'), settings, notBefore('2026-11-27T11:00'), 'day_before_afternoon').departure_local).toBe('2026-11-27T12:00');
  });
  it('not_after earlier than default → that time (and an extra night if a day earlier)', () => {
    expect(planDeparture(game('G10'), settings, notAfter('2026-11-27T10:30'), 'day_before_afternoon').departure_local).toBe('2026-11-27T10:30');
    const p = planDeparture(game('G10'), settings, notAfter('2026-11-26T15:00'), 'day_before_afternoon');
    expect(p).toMatchObject({ departure_local: '2026-11-26T15:00', nights: 2, trip_days: 3 });
  });
  it('not_before Sat 10:00 (game day) → infeasible with a readable reason', () => {
    const p = planDeparture(game('G10'), settings, notBefore('2026-11-28T10:00'), 'day_before_afternoon');
    expect(p.feasible).toBe(false);
    expect(p.departure_local).toBe('2026-11-28T10:00');
    expect(p.infeasible_reason).toBe("Can't leave before Sat Nov 28, 10:00 AM and still arrive 3 h before kickoff");
  });
  it('game_day: infeasible when the drive is too long or kickoff too early', () => {
    const p = planDeparture(game('G02'), settings, NONE, 'game_day'); // 165-min drive
    expect(p.feasible).toBe(false);
    expect(p.infeasible_reason).toMatch(/Same-day travel/);
    expect(p).toMatchObject({ overnight: false, nights: 0, trip_days: 1 });
  });
  it('game_day hand-computed: 2 h drive, 15:30 kickoff → depart 10:00 (15:30 − 3 h − 120 − 30)', () => {
    const g: Game = { ...game('G02'), drive_hours_one_way: 2, road_miles_one_way: 110 };
    expect(planDeparture(g, settings, NONE, 'game_day')).toEqual({
      feasible: true, infeasible_reason: '', departure_local: '2026-10-03T10:00', overnight: false, nights: 0, trip_days: 1,
    });
    const late = planDeparture(g, settings, notBefore('2026-10-03T11:00'), 'game_day');
    expect(late.feasible).toBe(false);
  });
});

describe('buildItinerary', () => {
  it('G10 day_before_afternoon: hand-computed timeline', () => {
    const { items } = build(game('G10'), 'day_before_afternoon', 'H-ATH-1');
    expectWellFormed(items);
    const depart = one(items, 'depart');
    expect(depart).toMatchObject({ id: 'IT-1', start_local: '2026-11-27T12:00', location: 'BGSU Football Complex, Bowling Green, OH' });
    const meals = at(items, 'meal');
    expect(meals.map((m) => [m.label, m.start_local, m.end_local, m.meal_id])).toEqual([
      ['En-route lunch', '2026-11-27T13:50', '2026-11-27T14:35', 'ML-1'],
      ['Team dinner', '2026-11-27T19:25', '2026-11-27T20:25', 'ML-2'], // after walkthrough 17:55–18:55 + 30
      ['Pre-game meal', '2026-11-28T08:00', '2026-11-28T08:45', 'ML-3'], // ends 12:00 − 3 h − 15 min
    ]);
    expect(meals.every((m) => m.location === '')).toBe(true);
    expect(one(items, 'arrive_hotel').start_local).toBe('2026-11-27T16:55'); // arrives the same day
    expect(one(items, 'checkin')).toMatchObject({ start_local: '2026-11-27T16:55', end_local: '2026-11-27T17:25' });
    expect(one(items, 'walkthrough')).toMatchObject({ start_local: '2026-11-27T17:55', end_local: '2026-11-27T18:55' });
    expect(at(items, 'meeting')).toHaveLength(0); // dinner ends after 20:00
    expect(one(items, 'curfew').start_local).toBe('2026-11-27T22:30');
    expect(one(items, 'depart_hotel').start_local).toBe('2026-11-28T08:55'); // 09:30 − 25 − 10
    expect(one(items, 'arrive_stadium').start_local).toBe('2026-11-28T09:30');
    expect(one(items, 'kickoff')).toMatchObject({ label: 'Kickoff vs Ohio', start_local: '2026-11-28T12:00', location: 'Hocking Valley Stadium' });
    expect(one(items, 'depart_return')).toMatchObject({
      label: 'Buses depart for home (boxed meal on bus)', start_local: '2026-11-28T16:00', meal_id: 'ML-4',
    });
    expect(one(items, 'arrive_home').start_local).toBe('2026-11-28T20:10'); // 16:00 + 220 + 30 = +4 h 10
    expect(items.some((i) => i.label === 'Breakfast')).toBe(false); // noon kickoff
  });

  it('G12 Buffalo: pregame meal ends ≥ 3 h before kickoff; arrive_home after depart_return', () => {
    const { items } = build(game('G12'), 'day_before_afternoon', 'H-BUF-1');
    expectWellFormed(items);
    const kickoff = one(items, 'kickoff').start_local;
    expect(kickoff).toBe('2026-12-12T13:00');
    const pregame = items.find((i) => mealKindOf(i) === 'pregame_meal')!;
    expect(pregame).toMatchObject({ start_local: '2026-12-12T09:00', end_local: '2026-12-12T09:45' });
    expect(pregame.end_local <= '2026-12-12T10:00').toBe(true);
    expect(one(items, 'arrive_hotel').start_local).toBe('2026-12-11T18:40'); // 12:00 + 325 + 45 + 30
    expect(at(items, 'walkthrough')).toHaveLength(0); // check-in ends 19:10 > 18:00
    const ret = one(items, 'depart_return');
    const home = one(items, 'arrive_home');
    expect(ret.start_local).toBe('2026-12-12T17:00');
    expect(home.start_local).toBe('2026-12-12T22:55'); // 17:00 + 325 + 30
    expect(home.start_local > ret.start_local).toBe(true);
  });

  it('G12 day_before_morning (Game-Ready): walkthrough, 18:30 dinner and meetings fit', () => {
    const { items } = build(game('G12'), 'day_before_morning', 'H-BUF-1');
    expectWellFormed(items);
    expect(items.map((i) => [i.kind, i.start_local]).slice(0, 9)).toEqual([
      ['depart', '2026-12-11T09:00'],
      ['meal', '2026-12-11T11:45'],
      ['arrive_hotel', '2026-12-11T15:40'],
      ['checkin', '2026-12-11T15:40'],
      ['walkthrough', '2026-12-11T16:40'],
      ['meal', '2026-12-11T18:30'],
      ['meeting', '2026-12-11T20:00'],
      ['curfew', '2026-12-11T22:30'],
      ['meal', '2026-12-12T09:00'],
    ]);
  });

  it('afternoon kickoff gets a breakfast; plain rest stop when no route-stop city', () => {
    const { items } = build(game('G08'), 'day_before_afternoon', null); // Oxford 15:30, 175 mi, no stop city
    expectWellFormed(items);
    expect(items.find((i) => i.label === 'Breakfast')).toMatchObject({ start_local: '2026-11-14T08:30', end_local: '2026-11-14T09:15' });
    expect(one(items, 'stop')).toMatchObject({ label: 'Rest stop', meal_id: '', location: 'En route' });
  });

  it('en-route dinner replaces the hotel team dinner', () => {
    const { items } = build(game('G10'), 'day_before_afternoon', 'H-ATH-1', notBefore('2026-11-27T16:00'));
    expectWellFormed(items);
    const dinners = items.filter((i) => mealKindOf(i) === 'team_dinner');
    expect(dinners.map((d) => d.label)).toEqual(['Team dinner (en route)']); // stop starts 17:50
  });

  it('same-day trip: depart, arrive_stadium, kickoff, depart_return (+boxed meal), arrive_home', () => {
    const g: Game = { ...game('G02'), drive_hours_one_way: 2, road_miles_one_way: 110 };
    const { items } = build(g, 'game_day', null);
    expectWellFormed(items);
    expect(items.map((i) => [i.kind, i.start_local, i.meal_id])).toEqual([
      ['depart', '2026-10-03T10:00', ''],
      ['arrive_stadium', '2026-10-03T12:30', ''],
      ['kickoff', '2026-10-03T15:30', ''],
      ['depart_return', '2026-10-03T19:30', 'ML-1'],
      ['arrive_home', '2026-10-03T22:00', ''],
    ]);
  });

  it('is deterministic', () => {
    expect(build(game('G10'), 'day_before_morning', 'H-ATH-3').items).toEqual(build(game('G10'), 'day_before_morning', 'H-ATH-3').items);
  });

  it('every away game × strategy builds a well-formed itinerary', () => {
    for (const g of pack.schedule.filter((x) => x.home_away === 'away')) {
      for (const s of ['day_before_afternoon', 'day_before_morning', 'game_day'] as const) {
        const h = pack.hotels.find((x) => x.city === g.city) ?? null;
        expectWellFormed(build(g, s, s === 'game_day' ? null : h?.hotel_id ?? null).items);
      }
    }
  });
});

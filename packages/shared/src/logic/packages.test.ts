import { describe, expect, it } from 'vitest';
import { loadDataPack, planningData } from '../testing/loadData';
import { TravelPackage, type Game, type Hotel, type TripRequest } from '../domain';
import { FIXTURE_PACKAGES } from '../fixtures';
import { buildMealPlan, dietaryGaps } from './meals';
import { buildPackages, VALUE_PER_MILE } from './packages';
import { buildItinerary, planDeparture } from './itinerary';
import { round2 } from './money';

const pack = loadDataPack();
const data = planningData(pack);
const settings = pack.settings;
const game = (id: string) => pack.schedule.find((g) => g.game_id === id)!;
const hotel = (id: string) => pack.hotels.find((h) => h.hotel_id === id)!;

const REQ: TripRequest = {
  game_id: 'G10', players: 70, coaches: 12, support_staff: 12,
  departure_constraint: { kind: 'none', datetime_local: '', raw_text: '' },
  include_equipment_truck: true,
  caps: { lodging: null, meals: null, bus: null, total: null },
  excluded_hotel_ids: [], preference: 'none', notes: '',
};
const reqFor = (g: Game, extra: Partial<TripRequest> = {}): TripRequest => ({ ...REQ, game_id: g.game_id, ...extra });
const cityHotels = (g: Game) => pack.hotels.filter((h) => h.city === g.city);
const hotelTotal = (h: Hotel) => h.nightly_rate * (1 + h.tax_rate);

describe('buildPackages', () => {
  for (const id of ['G10', 'G12', 'G06']) {
    describe(id, () => {
      const g = game(id);
      const pkgs = buildPackages(reqFor(g), g, data, settings);
      const [A, B, C] = pkgs as [TravelPackage, TravelPackage, TravelPackage];
      const roomy = cityHotels(g).filter((h) => h.rooms_available >= A.counts.rooms_total);

      it('returns A/B/C with stable ids, schema-valid', () => {
        expect(pkgs.map((p) => [p.option_id, p.tier, p.label])).toEqual([
          [`PKG-${id}-A`, 'A', 'Economy'], [`PKG-${id}-B`, 'B', 'Balanced'], [`PKG-${id}-C`, 'C', 'Game-Ready'],
        ]);
        for (const p of pkgs) TravelPackage.parse(p);
        expect(pkgs.every((p) => p.feasible && p.bus_company_id === 'BUS-1')).toBe(true);
        expect(A.round_trip_miles).toBe(2 * g.road_miles_one_way);
      });

      it("A's hotel is the cheapest with capacity", () => {
        const cheapest = [...roomy].sort((a, b) => hotelTotal(a) - hotelTotal(b))[0]!;
        expect(A.hotel_id).toBe(cheapest.hotel_id);
      });

      it("B's hotel is the best value (rate + $8/mile)", () => {
        const best = [...roomy].sort((a, b) => hotelTotal(a) + VALUE_PER_MILE * a.miles_to_stadium - (hotelTotal(b) + VALUE_PER_MILE * b.miles_to_stadium))[0]!;
        expect(B.hotel_id).toBe(best.hotel_id);
      });

      it("C's hotel has meal service and is the closest such", () => {
        const h = hotel(C.hotel_id);
        expect(h.has_team_meal_service).toBe(true);
        const closest = roomy.filter((x) => x.has_team_meal_service).sort((a, b) => a.miles_to_stadium - b.miles_to_stadium)[0]!;
        expect(C.hotel_id).toBe(closest.hotel_id);
        expect(C.departure_local.endsWith('T09:00')).toBe(true);
        expect(C.meals.some((m) => m.source === 'hotel' && m.vendor_id === C.hotel_id)).toBe(true);
      });

      it('totals add up; every meal headcount = 94 and costs = headcount × price', () => {
        for (const p of pkgs) {
          const c = p.costs;
          expect(c.total).toBe(round2(c.subtotal + c.contingency));
          expect(c.subtotal).toBe(round2(c.bus + c.equipment + c.hotel + c.meals));
          expect(c.meals).toBe(round2(p.meals.reduce((s, m) => s + m.cost, 0)));
          expect(p.meals.length).toBeGreaterThan(0);
          for (const m of p.meals) {
            expect(m.headcount).toBe(94);
            expect(m.cost).toBe(round2(94 * m.price_per_person));
            expect(m.over_allowance).toBe(m.price_per_person > settings.meal_allowance_per_meal);
          }
        }
      });

      it('meal lines link to itinerary items, which carry the vendor as location', () => {
        for (const p of pkgs) {
          for (const m of p.meals) {
            const item = p.itinerary.find((i) => i.id === m.itinerary_item_id)!;
            expect(item.meal_id).toBe(m.meal_id);
            expect(m.time_local).toBe(item.start_local);
            if (item.kind === 'meal') expect(item.location.startsWith(`${m.vendor_name}, `)).toBe(true);
          }
          expect(p.return_local).toBe(p.itinerary.find((i) => i.kind === 'arrive_home')!.start_local);
        }
      });

      it('excluded hotel is never chosen', () => {
        const excl = [A.hotel_id, B.hotel_id, C.hotel_id];
        const again = buildPackages(reqFor(g, { excluded_hotel_ids: excl }), g, data, settings);
        for (const p of again) expect(excl).not.toContain(p.hotel_id);
      });

      it('not_before game day 10:00 → all three infeasible, costs still computed', () => {
        const r = reqFor(g, { departure_constraint: { kind: 'not_before', datetime_local: `${g.date}T10:00`, raw_text: '' } });
        const pk = buildPackages(r, g, data, settings);
        expect(pk).toHaveLength(3);
        for (const p of pk) {
          expect(p.feasible).toBe(false);
          expect(p.infeasible_reason).toMatch(/Can't leave before/);
          expect(p.costs.total).toBeGreaterThan(0);
        }
      });
    });
  }

  it('G10 Economy reproduces the contract fixture costs and meal vendors', () => {
    const [A] = buildPackages(REQ, game('G10'), data, settings);
    const fx = FIXTURE_PACKAGES[0]!;
    expect(A!.hotel_id).toBe('H-ATH-1');
    expect(A!.counts).toEqual(fx.counts);
    expect(A!.costs).toEqual(fx.costs); // 8676.63 + 2040 + 7007.13 + 6674 → 26349.58
    expect(A!.meals.map((m) => [m.kind, m.vendor_id, m.price_per_person])).toEqual([
      ['en_route_lunch', 'R-CMH-2', 26], // cheapest Columbus stop with capacity ≥ 94
      ['team_dinner', 'R-ATH-5', 15],
      ['pregame_meal', 'R-ATH-5', 15],
      ['postgame_boxed', 'R-ATH-5', 15],
    ]);
  });

  it('every away game builds 3 schema-valid packages', () => {
    for (const g of pack.schedule.filter((x) => x.home_away === 'away')) {
      const pk = buildPackages(reqFor(g), g, data, settings);
      expect(pk).toHaveLength(3);
      for (const p of pk) TravelPackage.parse(p);
    }
  });

  it('no hotel has capacity → largest hotel is used', () => {
    const g = game('G10');
    const pk = buildPackages(reqFor(g, { players: 150, coaches: 40, support_staff: 60 }), g, data, settings);
    const largest = [...cityHotels(g)].sort((a, b) => b.rooms_available - a.rooms_available)[0]!;
    for (const p of pk) expect(p.hotel_id).toBe(largest.hotel_id);
  });

  it('every city hotel excluded → infeasible with a reason, no hotel cost', () => {
    const g = game('G10');
    const pk = buildPackages(reqFor(g, { excluded_hotel_ids: cityHotels(g).map((h) => h.hotel_id) }), g, data, settings);
    for (const p of pk) {
      expect(p).toMatchObject({ feasible: false, hotel_id: '' });
      expect(p.infeasible_reason).toMatch(/No hotel available/);
      expect(p.costs.hotel).toBe(0);
    }
  });
});

describe('buildMealPlan', () => {
  const g = game('G10');
  const plan = planDeparture(g, settings, REQ.departure_constraint, 'day_before_afternoon');
  const itinerary = buildItinerary({ game: g, settings, plan, hotel: hotel('H-ATH-3'), homeCity: 'Bowling Green, OH' });
  const base = { itinerary, game: g, restaurants: pack.restaurants, headcount: 94, settings };

  it('dietary gaps: unique, non-none, missing from vendor', () => {
    expect(dietaryGaps(['vegetarian', 'vegetarian', 'nut_allergy', 'none'], ['none', 'vegetarian'])).toEqual(['nut_allergy']);
    expect(dietaryGaps(['gluten_free'], 'all')).toEqual([]);
  });

  it('group_friendly prefers group-friendly vendors with fewest dietary gaps, then price', () => {
    const { meals } = buildMealPlan({ ...base, hotel: hotel('H-ATH-3'), strategy: 'group_friendly', travelerDiets: ['vegetarian', 'gluten_free', 'nut_allergy'] });
    // Athens group-friendly with full diet coverage: R-ATH-1 ($33), R-ATH-2 ($21) → R-ATH-2
    expect(meals.filter((m) => m.kind !== 'en_route_lunch').every((m) => m.vendor_id === 'R-ATH-2')).toBe(true);
    expect(meals.find((m) => m.kind === 'en_route_lunch')!.vendor_id).toBe('R-CMH-1'); // only group-friendly Columbus stop
  });

  it('hotel_service uses the hotel for dinner/pre-game, restaurants elsewhere', () => {
    const h = hotel('H-ATH-3');
    const { meals, itinerary: it2 } = buildMealPlan({ ...base, hotel: h, strategy: 'hotel_service', travelerDiets: ['nut_allergy'] });
    const byKind = Object.fromEntries(meals.map((m) => [m.kind, m]));
    expect(byKind.team_dinner).toMatchObject({ source: 'hotel', vendor_id: h.hotel_id, price_per_person: h.team_meal_price_pp, dietary_gaps: [] });
    expect(byKind.pregame_meal!.source).toBe('hotel');
    expect(byKind.en_route_lunch!.source).toBe('restaurant');
    expect(byKind.postgame_boxed!.source).toBe('restaurant');
    expect(it2.find((i) => i.meal_id === byKind.team_dinner!.meal_id)!.location).toBe(`${h.name}, Athens`);
  });

  it('hotel_service without meal service falls back to group_friendly', () => {
    const { meals } = buildMealPlan({ ...base, hotel: hotel('H-ATH-1'), strategy: 'hotel_service', travelerDiets: [] });
    expect(meals.every((m) => m.source === 'restaurant')).toBe(true);
  });
});

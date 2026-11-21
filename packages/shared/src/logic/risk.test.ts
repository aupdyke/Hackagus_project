import { describe, expect, it } from 'vitest';
import { loadDataPack, planningData } from '../testing/loadData';
import { RiskFlag, type RiskCode, type TravelPackage, type TripRequest } from '../domain';
import { factGuard, factsFromText } from './factGuard';
import { memoFacts } from './facts';
import { buildPackages } from './packages';
import { computeRiskFlags } from './risk';
import { selectTravelingPlayers } from './travelers';

const pack = loadDataPack();
const data = planningData(pack);
const settings = pack.settings;
const game = (id: string) => pack.schedule.find((g) => g.game_id === id)!;
const hotel = (id: string) => pack.hotels.find((h) => h.hotel_id === id)!;
const NONE = { kind: 'none' as const, datetime_local: '', raw_text: '' };
const REQ: TripRequest = {
  game_id: 'G10', players: 70, coaches: 12, support_staff: 12, departure_constraint: NONE, include_equipment_truck: true,
  caps: { lodging: null, meals: null, bus: null, total: null }, excluded_hotel_ids: [], preference: 'none', notes: '',
};
const build = (id: string, patch: Partial<TripRequest> = {}, seasonShare?: number) =>
  buildPackages({ ...REQ, game_id: id, ...patch }, game(id), data, settings, { seasonShare });
const codes = (p: TravelPackage) => p.risk_flags.map((f) => f.code);
const flag = (p: TravelPackage, code: RiskCode) => p.risk_flags.find((f) => f.code === code);
const notBefore = (t: string) => ({ departure_constraint: { kind: 'not_before' as const, datetime_local: t, raw_text: '' } });

describe('computeRiskFlags', () => {
  it('clean default package: no critical flags; every flag schema-valid with a code-written message', () => {
    for (const id of ['G10', 'G12', 'G06']) {
      for (const p of build(id)) {
        expect(p.risk_flags.filter((f) => f.severity === 'critical')).toEqual([]);
        for (const f of p.risk_flags) {
          RiskFlag.parse(f);
          expect(f.option_id).toBe(p.option_id);
          expect(f.message.length).toBeGreaterThan(10);
        }
      }
    }
  });

  it('late_hotel_arrival: Fri 19:00 departure arrives 11:30 PM', () => {
    const [A] = build('G10', notBefore('2026-11-27T19:00'));
    const f = flag(A!, 'late_hotel_arrival')!;
    expect(f).toMatchObject({ severity: 'warning', message: 'Arrives at hotel 11:30 PM — after the 11:00 PM latest arrival setting.' });
    expect(A!.itinerary.find((i) => i.id === f.related_item_id)!.kind).toBe('arrive_hotel');
    // arriving after midnight shows the day too
    const [late] = build('G10', notBefore('2026-11-27T20:00'));
    expect(flag(late!, 'late_hotel_arrival')!.message).toBe('Arrives at hotel Sat Nov 28, 12:30 AM — after the 11:00 PM latest arrival setting.');
    // exactly 23:00 is fine
    expect(codes(build('G10', notBefore('2026-11-27T18:30'))[0]!)).not.toContain('late_hotel_arrival');
  });

  it('arrival_close_to_kickoff + infeasible_departure: game-day 06:00 departure', () => {
    const [A] = build('G10', notBefore('2026-11-28T06:00'));
    expect(A!.feasible).toBe(false);
    expect(flag(A!, 'infeasible_departure')).toMatchObject({ severity: 'critical', message: A!.infeasible_reason });
    expect(flag(A!, 'infeasible_departure')!.related_item_id).toBe(A!.itinerary.find((i) => i.kind === 'depart')!.id);
    expect(flag(A!, 'arrival_close_to_kickoff')).toMatchObject({
      severity: 'critical', message: 'Arrives Sat Nov 28, 10:30 AM — only 1.5 hours before kickoff (minimum 3 hours).',
    });
  });

  it('meal_close_to_kickoff: close (+30 min) and under the minimum', () => {
    const [A] = build('G10');
    const f = flag(A!, 'meal_close_to_kickoff')!;
    expect(f.message).toBe('Pre-game meal ends 3.25 hours before kickoff — close to the 3-hour minimum.');
    expect(A!.itinerary.find((i) => i.id === f.related_item_id)!.label).toBe('Pre-game meal');
    const stricter = computeRiskFlags(A!, { game: game('G10'), hotel: hotel(A!.hotel_id), settings: { ...settings, min_hours_meal_before_kickoff: 4 }, request: REQ });
    expect(stricter.find((x) => x.code === 'meal_close_to_kickoff')!.message).toBe('Pre-game meal ends 3.25 hours before kickoff — under the 4-hour minimum.');
    const relaxed = computeRiskFlags(A!, { game: game('G10'), hotel: hotel(A!.hotel_id), settings: { ...settings, min_hours_meal_before_kickoff: 2 }, request: REQ });
    expect(relaxed.map((x) => x.code)).not.toContain('meal_close_to_kickoff');
  });

  it('bus_near_capacity: 107 travelers on 112 seats', () => {
    const [A] = build('G10', { players: 83 });
    expect(flag(A!, 'bus_near_capacity')).toMatchObject({ severity: 'info', message: 'Buses are 96% full (107 travelers, 112 seats).' });
    expect(codes(build('G10', { players: 82 })[0]!)).not.toContain('bus_near_capacity'); // 106 ≤ 106.4
  });

  it('insufficient_rooms: hotel smaller than rooms_total', () => {
    const [A] = build('G10');
    const small = { ...hotel(A!.hotel_id), rooms_available: 40 };
    const f = computeRiskFlags(A!, { game: game('G10'), hotel: small, settings, request: REQ }).find((x) => x.code === 'insufficient_rooms');
    expect(f).toMatchObject({ severity: 'critical', message: `Needs 56 rooms but ${small.name} has only 40 available.` });
    // no hotel fits at all → builder picks the largest and the flag shows up on the package
    const big = build('G10', { players: 96, coaches: 40, support_staff: 60 });
    expect(big.every((p) => codes(p).includes('insufficient_rooms'))).toBe(true);
  });

  it('meal_over_allowance: one flag listing the meals', () => {
    const C = build('G10')[2]!;
    const f = C.risk_flags.filter((x) => x.code === 'meal_over_allowance');
    expect(f).toHaveLength(1);
    expect(f[0]!.message).toBe('Team dinner ($31 per person) and Pre-game meal ($31 per person) are over the $28 meal allowance.');
    const G12B = build('G12')[1]!;
    expect(flag(G12B, 'meal_over_allowance')!.message).toMatch(/Post-game boxed meal \(\$31 per person\) are over/);
  });

  it('dietary_gap: per meal, with the number of travelers affected', () => {
    const A = build('G12')[0]!;
    const gaps = A.risk_flags.filter((x) => x.code === 'dietary_gap');
    expect(gaps.length).toBe(A.meals.filter((m) => m.dietary_gaps.length).length);
    const diets = selectTravelingPlayers(pack.roster, 70).map((p) => p.dietary).filter((d) => d !== 'none');
    const meal = A.meals.find((m) => m.dietary_gaps.length)!;
    const n = diets.filter((d) => meal.dietary_gaps.includes(d)).length;
    expect(gaps[0]!.related_item_id).toBe(meal.itinerary_item_id);
    expect(gaps[0]!.message).toMatch(new RegExp(`has no .* option — ${n} travelers affected\\.$`));
    expect(gaps[0]!.message).toMatch(/vegetarian, gluten-free or nut-allergy/);
  });

  it('over_season_share only when a share is given and exceeded', () => {
    const [A, B] = build('G10', {}, 28000);
    expect(codes(A!)).not.toContain('over_season_share'); // 26,349.58
    expect(flag(B!, 'over_season_share')!.message).toBe(`Total $${Math.round(B!.costs.total).toLocaleString('en-US')} is over the per-trip season share of $28,000.`);
    expect(codes(build('G10')[1]!)).not.toContain('over_season_share');
  });

  it('over_cap for each category', () => {
    const [A] = build('G10', { caps: { lodging: 5000, meals: 5000, bus: 10000, total: 20000 } });
    const msgs = A!.risk_flags.filter((f) => f.code === 'over_cap').map((f) => f.message);
    expect(msgs).toEqual([
      'Lodging $7,007 is over the $5,000 cap.',
      'Meals $6,674 is over the $5,000 cap.',
      'Bus and equipment $10,717 is over the $10,000 cap.',
      'Total $26,350 is over the $20,000 cap.',
    ]);
    expect(codes(build('G10', { caps: { lodging: 8000, meals: null, bus: null, total: null } })[0]!)).not.toContain('over_cap');
  });

  it('sorted critical → warning → info', () => {
    const [A] = build('G10', { ...notBefore('2026-11-28T06:00'), players: 83, caps: { lodging: 1, meals: null, bus: null, total: null } }, 1);
    const sev = A!.risk_flags.map((f) => f.severity);
    const order = { critical: 0, warning: 1, info: 2 };
    expect(sev).toEqual([...sev].sort((a, b) => order[a] - order[b]));
    expect(new Set(codes(A!))).toEqual(new Set(['infeasible_departure', 'arrival_close_to_kickoff', 'over_season_share', 'over_cap', 'bus_near_capacity']));
  });
});

describe('risk messages vs the fact guard', () => {
  it('factsFromText allows the numbers in code-written text', () => {
    const f = factsFromText('Pre-game meal ends 3.25 hours before kickoff — close to the 3-hour minimum. Lodging $7,007 is over the $5,000 cap at 2:30 PM on 2026-11-27.');
    expect(f.quantities.hour).toEqual([3.25, 3]);
    expect(f.money).toEqual([7007, 5000]);
    expect(f.times).toEqual(['14:30']);
    expect(f.dates).toEqual(['2026-11-27']);
  });

  it('a memo quoting risk messages verbatim is not flagged', () => {
    const C = build('G10', { caps: { lodging: 5000, meals: null, bus: null, total: null } })[2]!;
    const { allowed } = memoFacts(game('G10'), REQ, C);
    const memo = C.risk_flags.map((f) => `- ${f.message}`).join('\n');
    expect(factGuard(memo, allowed).issues).toEqual([]);
  });
});

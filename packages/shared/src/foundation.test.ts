import { describe, expect, it } from 'vitest';
import { loadDataPack } from './testing/loadData';
import {
  PARSE_SCHEMA, WHATIF_SCHEMA, assertAivanaSchema, assistantSchema, recommendSchema, savingsSchema,
} from './ai/schemas';
import { addMinutes, formatClock, formatDayTime, hoursBetween, resolveDay } from './logic/time';
import { formatUSD, round2 } from './logic/money';
import { matchGame, resolveParse, fallbackParse } from './logic/parse';
import { ParseResult, TravelPackage, Trip } from './domain';
import * as fx from './fixtures';

describe('data pack', () => {
  const pack = loadDataPack();
  it('validates against domain schemas and has the expected shape', () => {
    expect(pack.roster.length).toBeGreaterThanOrEqual(95);
    expect(pack.roster.filter((p) => p.default_travel)).toHaveLength(70);
    expect(pack.schedule).toHaveLength(12);
    expect(pack.schedule.filter((g) => g.home_away === 'away')).toHaveLength(6);
    for (const g of pack.schedule.filter((g) => g.home_away === 'away')) {
      expect(pack.hotels.filter((h) => h.city === g.city).length).toBeGreaterThanOrEqual(3);
      expect(pack.restaurants.filter((r) => r.city === g.city).length).toBeGreaterThanOrEqual(4);
      if (g.route_stop_city) expect(pack.restaurants.some((r) => r.city === g.route_stop_city && r.route_stop)).toBe(true);
    }
  });
  it('ids are unique', () => {
    const ids = [...pack.roster.map((p) => p.id), ...pack.staff.map((s) => s.id), ...pack.hotels.map((h) => h.hotel_id), ...pack.restaurants.map((r) => r.restaurant_id)];
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('every phone number is in the fictional 555-01xx range', () => {
    for (const p of [...pack.staff.map((s) => s.phone), ...pack.hotels.map((h) => h.phone), ...pack.busRates.map((b) => b.phone)]) {
      expect(p).toMatch(/555-01\d\d$/);
    }
  });
});

describe('Aivana schemas use only supported keywords', () => {
  it.each([
    ['parse', PARSE_SCHEMA],
    ['whatif', WHATIF_SCHEMA],
    ['recommend', recommendSchema(['PKG-G10-A', 'PKG-G10-B', 'PKG-G10-C'])],
    ['savings', savingsSchema(['SAV-1', 'SAV-2'])],
    ['assistant', assistantSchema(['IT-1', 'F-hotel'])],
  ])('%s', (_name, schema) => {
    expect(() => assertAivanaSchema(schema)).not.toThrow();
  });
  it('rejects unsupported keywords', () => {
    expect(() => assertAivanaSchema({ type: 'object', properties: { a: { type: 'string', pattern: 'x' } } })).toThrow(/pattern/);
    expect(() => assertAivanaSchema({ type: 'object', properties: { a: { anyOf: [] } } } as never)).toThrow();
  });
});

describe('time + money helpers', () => {
  it('adds minutes across midnight', () => expect(addMinutes('2026-11-27T23:30', 45)).toBe('2026-11-28T00:15'));
  it('hours between', () => expect(hoursBetween('2026-11-27T11:00', '2026-11-28T12:00')).toBe(25));
  it('resolves weekday relative to game date', () => {
    expect(resolveDay('2026-11-28', 'fri')).toBe('2026-11-27');
    expect(resolveDay('2026-11-28', 'day_before')).toBe('2026-11-27');
    expect(resolveDay('2026-11-28', 'sat')).toBe('2026-11-28');
    expect(resolveDay('2026-11-28', '')).toBeNull();
  });
  it('formats', () => {
    expect(formatClock('14:05')).toBe('2:05 PM');
    expect(formatClock('00:10')).toBe('12:10 AM');
    expect(formatDayTime('2026-11-27T14:00')).toBe('Fri Nov 27, 2:00 PM');
    expect(formatUSD(12345.6)).toBe('$12,346');
    expect(formatUSD(12345.6, { cents: true })).toBe('$12,345.60');
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});

describe('parse resolution (code does matching, not the model)', () => {
  const { schedule } = loadDataPack();
  it('matches opponents by name, alias, city', () => {
    expect(matchGame('Ohio', '', schedule).game?.game_id).toBe('G10');
    expect(matchGame('Miami', '', schedule).game?.game_id).toBe('G08');
    expect(matchGame('WMU', '', schedule).game?.game_id).toBe('G04');
    expect(matchGame('Athens', '', schedule).game?.game_id).toBe('G10');
    expect(matchGame('Notre Dame', '', schedule).game).toBeNull();
  });
  it('resolves departure day/time and flags missing fields', () => {
    const r = resolveParse({
      opponent: 'Ohio', game_date: '', players: 70, coaches: 12, support_staff: -1,
      departure_constraint: { kind: 'not_before', day: 'fri', time_24h: '14:00', raw_text: "can't leave before 2 PM Friday" },
      include_equipment_truck: 'yes', missing_fields: [], ambiguities: [],
    }, schedule);
    expect(r.draft.game_id).toBe('G10');
    expect(r.draft.departure_constraint.datetime_local).toBe('2026-11-27T14:00');
    expect(r.missing_fields).toEqual(['support_staff']);
  });
  it('flags home games', () => {
    const r = resolveParse({
      opponent: 'Toledo', game_date: '', players: 70, coaches: 12, support_staff: 12,
      departure_constraint: { kind: 'none', day: '', time_24h: '', raw_text: '' },
      include_equipment_truck: 'yes', missing_fields: [], ambiguities: [],
    }, schedule);
    expect(r.draft.game_id).toBeNull();
    expect(r.ambiguities[0]?.message).toMatch(/home game/);
  });
  it('fallback parse is schema-valid', () => expect(ParseResult.safeParse(fallbackParse('x y z')).success).toBe(true));
});

describe('fixtures are schema-valid', () => {
  it('trip + packages', () => {
    expect(Trip.safeParse(fx.FIXTURE_TRIP).success).toBe(true);
    for (const p of fx.FIXTURE_PACKAGES) expect(TravelPackage.safeParse(p).success).toBe(true);
  });
});

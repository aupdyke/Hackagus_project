import { describe, expect, it } from 'vitest';
import { loadDataPack, planningData } from '../testing/loadData';
import { PackageDiff, PatchOp, TripRequest } from '../domain';
import type { AiWhatIfOut } from '../ai/schemas';
import { buildPackages } from './packages';
import { aiOpsToPatch, applyPatch, constraintIssue, describeOp, diffPackages } from './whatif';

const pack = loadDataPack();
const data = planningData(pack);
const game = pack.schedule.find((g) => g.game_id === 'G10')!;
const ctx = { game, data };
const REQ: TripRequest = {
  game_id: 'G10', players: 70, coaches: 12, support_staff: 12,
  departure_constraint: { kind: 'none', datetime_local: '', raw_text: '' },
  include_equipment_truck: true,
  caps: { lodging: null, meals: null, bus: null, total: null },
  excluded_hotel_ids: [], preference: 'none', notes: '',
};
type AiOp = AiWhatIfOut['patch_ops'][number];
const base: Omit<AiOp, 'op'> = {
  field: '', value: -1, delta: 0, category: '', max: -1, hotel_id: '', criterion: 'none',
  constraint_kind: '', constraint_day: '', constraint_time_24h: '', bool_value: '',
};
const ai = (o: Partial<AiOp> & Pick<AiOp, 'op'>): AiOp => ({ ...base, ...o });

describe('aiOpsToPatch', () => {
  it('converts every valid flattened op to a typed PatchOp', () => {
    const { ops, rejected } = aiOpsToPatch([
      ai({ op: 'set_count', field: 'coaches', value: 10 }),
      ai({ op: 'adjust_count', field: 'players', delta: -3 }),
      ai({ op: 'set_cap', category: 'lodging', max: 6500 }),
      ai({ op: 'clear_cap', category: 'total' }),
      ai({ op: 'set_departure_constraint', constraint_kind: 'not_before', constraint_day: 'fri', constraint_time_24h: '14:00' }),
      ai({ op: 'set_departure_constraint', constraint_kind: 'none' }),
      ai({ op: 'exclude_hotel', hotel_id: 'H-ATH-1' }),
      ai({ op: 'set_equipment_truck', bool_value: 'no' }),
      ai({ op: 'prefer', criterion: 'closest_to_stadium' }),
    ], ctx);
    expect(rejected).toEqual([]);
    for (const op of ops) PatchOp.parse(op);
    expect(ops).toEqual([
      { op: 'set_count', field: 'coaches', value: 10 },
      { op: 'adjust_count', field: 'players', delta: -3 },
      { op: 'set_cap', category: 'lodging', max: 6500 },
      { op: 'clear_cap', category: 'total' },
      { op: 'set_departure_constraint', constraint: { kind: 'not_before', datetime_local: '2026-11-27T14:00', raw_text: 'Not before Fri Nov 27, 2:00 PM' } },
      { op: 'set_departure_constraint', constraint: { kind: 'none', datetime_local: '', raw_text: '' } },
      { op: 'exclude_hotel', hotel_id: 'H-ATH-1' },
      { op: 'set_equipment_truck', value: false },
      { op: 'prefer', criterion: 'closest_to_stadium' },
    ]);
  });

  it('rejects invalid ops with a reason', () => {
    const bad = [
      ai({ op: 'set_count', field: '', value: 5 }),
      ai({ op: 'set_count', field: 'players', value: -1 }),
      ai({ op: 'adjust_count', field: 'players', delta: 0 }),
      ai({ op: 'set_cap', category: 'meals', max: -1 }),
      ai({ op: 'clear_cap' }),
      ai({ op: 'set_departure_constraint', constraint_kind: 'not_after', constraint_day: '', constraint_time_24h: '09:00' }),
      ai({ op: 'set_departure_constraint', constraint_kind: 'not_after', constraint_day: 'fri', constraint_time_24h: '9am' }),
      ai({ op: 'set_departure_constraint' }),
      ai({ op: 'exclude_hotel', hotel_id: 'H-BUF-1' }),
      ai({ op: 'exclude_hotel', hotel_id: 'H-NOPE' }),
      ai({ op: 'set_equipment_truck' }),
      ai({ op: 'prefer' }),
    ];
    const { ops, rejected } = aiOpsToPatch(bad, ctx);
    expect(ops).toEqual([]);
    expect(rejected).toHaveLength(bad.length);
    expect(rejected.every((r) => r.reason.length > 0)).toBe(true);
    expect(rejected.find((r) => (r.op as AiOp).hotel_id === 'H-BUF-1')!.reason).toBe('Hotel "H-BUF-1" is not a Athens hotel');
  });
});

describe('applyPatch', () => {
  it('applies ops in order to a copy', () => {
    const before = structuredClone(REQ);
    const { request, rejected } = applyPatch(REQ, [
      { op: 'adjust_count', field: 'players', delta: -3 },
      { op: 'adjust_count', field: 'players', delta: -2 },
      { op: 'set_cap', category: 'lodging', max: 6500 },
      { op: 'exclude_hotel', hotel_id: 'H-ATH-1' },
      { op: 'set_equipment_truck', value: false },
      { op: 'prefer', criterion: 'lowest_cost' },
    ], ctx);
    expect(rejected).toEqual([]);
    expect(request).toMatchObject({ players: 65, caps: { lodging: 6500 }, excluded_hotel_ids: ['H-ATH-1'], include_equipment_truck: false, preference: 'lowest_cost' });
    TripRequest.parse(request);
    expect(REQ).toEqual(before); // input untouched
  });

  it('rejects (never clamps) out-of-range counts', () => {
    const r = applyPatch(REQ, [
      { op: 'adjust_count', field: 'players', delta: -70 },
      { op: 'set_count', field: 'players', value: 97 },
      { op: 'set_count', field: 'coaches', value: 41 },
      { op: 'adjust_count', field: 'support_staff', delta: -13 },
    ], ctx);
    expect(r.request).toMatchObject({ players: 70, coaches: 12, support_staff: 12 });
    expect(r.rejected.map((x) => x.reason)).toEqual([
      'Players would be 0; allowed 1–96',
      'Players would be 97; allowed 1–96 (only 96 players are travel-eligible)',
      'Coaches would be 41; allowed 0–40',
      'Support staff would be -1; allowed 0–60',
    ]);
  });

  it('rejects constraints outside the window, duplicate and last-hotel exclusions', () => {
    const r = applyPatch({ ...REQ, excluded_hotel_ids: ['H-ATH-2', 'H-ATH-3'] }, [
      { op: 'set_departure_constraint', constraint: { kind: 'not_before', datetime_local: '2026-11-28T13:00', raw_text: '' } },
      { op: 'exclude_hotel', hotel_id: 'H-ATH-2' },
      { op: 'exclude_hotel', hotel_id: 'H-ATH-1' },
      { op: 'exclude_hotel', hotel_id: 'H-ATH-4' },
    ], ctx);
    expect(r.rejected.map((x) => x.reason)).toEqual([
      expect.stringMatching(/between .* and kickoff/),
      'H-ATH-2 is already excluded',
      "Can't exclude every hotel in Athens",
    ]);
    expect(r.request.excluded_hotel_ids).toEqual(['H-ATH-2', 'H-ATH-3', 'H-ATH-1']);
  });

  it('constraintIssue', () => {
    expect(constraintIssue(REQ.departure_constraint, game)).toBeNull();
    expect(constraintIssue({ kind: 'not_before', datetime_local: '2026-11-25T00:00', raw_text: '' }, game)).toBeNull();
    expect(constraintIssue({ kind: 'not_before', datetime_local: '2026-11-24T23:59', raw_text: '' }, game)).toMatch(/between/);
    expect(constraintIssue({ kind: 'not_after', datetime_local: '', raw_text: '' }, game)).toMatch(/day and time/);
  });

  it('describeOp', () => {
    expect(describeOp({ op: 'adjust_count', field: 'players', delta: -3 })).toBe('Players −3');
    expect(describeOp({ op: 'set_cap', category: 'lodging', max: 6500 })).toBe('Lodging cap set to $6,500');
    expect(describeOp({ op: 'set_equipment_truck', value: false })).toBe('Equipment truck removed');
  });
});

describe('diffPackages', () => {
  const before = buildPackages(REQ, game, data, pack.settings);

  it('matches by option id with code-written changes', () => {
    const after = buildPackages({ ...REQ, players: 67, include_equipment_truck: false }, game, data, pack.settings);
    const diff = diffPackages(before, after);
    expect(diff.map((d) => d.option_id)).toEqual(['PKG-G10-A', 'PKG-G10-B', 'PKG-G10-C']);
    for (const d of diff) PackageDiff.parse(d);
    const a = diff[0]!;
    expect(a.before_total).toBe(before[0]!.costs.total);
    expect(a.after_total).toBe(after[0]!.costs.total);
    expect(a.delta).toBe(Math.round((after[0]!.costs.total - before[0]!.costs.total) * 100) / 100);
    expect(a.delta).toBeLessThan(0);
    expect(a.changes).toEqual(expect.arrayContaining(['Players 70 → 67', 'Buses 2 → 2', 'Equipment $2,040 → $0']));
    expect(a.changes.some((c) => /^Rooms 56 → \d+$/.test(c))).toBe(true);
    expect(a.changes.some((c) => /^Total \$[\d,]+ → \$[\d,]+$/.test(c))).toBe(true);
  });

  it('reports hotel switches and new infeasibility', () => {
    const after = buildPackages(
      { ...REQ, excluded_hotel_ids: ['H-ATH-1'], departure_constraint: { kind: 'not_before', datetime_local: '2026-11-28T10:00', raw_text: '' } },
      game, data, pack.settings,
    );
    const a = diffPackages(before, after)[0]!;
    expect(a.changes.find((c) => c.startsWith('Hotel '))).toMatch(/→/);
    expect(a.changes.some((c) => c.startsWith("Now infeasible: Can't leave before"))).toBe(true);
  });

  it('handles options that appear or disappear', () => {
    const d = diffPackages(before.slice(0, 2), before.slice(1));
    expect(d.find((x) => x.option_id === 'PKG-G10-C')).toMatchObject({ before_total: null, changes: ['New option'] });
    expect(d.find((x) => x.option_id === 'PKG-G10-A')).toMatchObject({ after_total: null, changes: ['Option no longer offered'] });
  });
});

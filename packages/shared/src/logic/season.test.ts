import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadDataPack, planningData } from '../testing/loadData';
import { SavingsCandidate, SeasonRollup, type Trip, type TripRequest, type TripStatus } from '../domain';
import { buildPackages } from './packages';
import { actualTotal, applySavings, defaultTripRequest, estimateUnplannedTrip, rollupSeason, savingsCandidates } from './season';

const pack = loadDataPack();
const data = planningData(pack);
const settings = pack.settings;
type Seed = { trip_id: string; game_id: string; status: TripStatus; request: TripRequest | null; selected_tier?: 'A' | 'B' | 'C' };
const seeds = (JSON.parse(readFileSync(new URL('../../../../data/trips_seed.json', import.meta.url), 'utf8')) as { data: Seed[] }).data;
const game = (id: string) => pack.schedule.find((g) => g.game_id === id)!;

function makeTrip(s: Seed): Trip {
  const packages = s.request ? buildPackages(s.request, game(s.game_id), data, settings) : [];
  return {
    trip_id: s.trip_id, game_id: s.game_id, status: s.status, request: s.request, packages,
    selected_option_id: s.selected_tier ? `PKG-${s.game_id}-${s.selected_tier}` : null,
    recommendation: null, whatif_history: [], memo: null, traveling_player_ids: [], traveling_staff_ids: [], rooming: null, buses: [],
    roommate_deadline_local: '', published_version: 0, published_at: '', share_token: '', updated_at: '',
  };
}
const seeded = () => seeds.map(makeTrip);
const total = (t: Trip) => t.packages.find((p) => p.option_id === t.selected_option_id)!.costs.total;
const round2 = (n: number) => Math.round(n * 100) / 100;

describe('rollupSeason (seeded data)', () => {
  const trips = seeded();
  const byId = (id: string) => trips.find((t) => t.trip_id === id)!;

  it('committed uses G02/G04 actuals and G06/G08 planned totals', () => {
    const r = rollupSeason(trips, pack.schedule, pack.actuals, settings);
    SeasonRollup.parse(r);
    const a = (id: string) => actualTotal(pack.actuals.find((x) => x.trip_id === id))!;
    expect(a('TRIP-G02')).toBe(26727.45);
    const committed = round2(a('TRIP-G02') + a('TRIP-G04') + total(byId('TRIP-G06')) + total(byId('TRIP-G08')));
    expect(r.committed).toBe(committed);
    expect(r.projected).toBe(round2(committed + total(byId('TRIP-G12')))); // not_started G10 adds 0 without data
    expect(r.remaining).toBe(round2(settings.season_travel_budget - r.projected));
    expect(r.rows.map((x) => x.trip_id)).toEqual(['TRIP-G02', 'TRIP-G04', 'TRIP-G06', 'TRIP-G08', 'TRIP-G10', 'TRIP-G12']);
    expect(r.rows.find((x) => x.trip_id === 'TRIP-G10')).toMatchObject({ counts_toward: 'none', planned_cost: null });
    expect(r.rows.find((x) => x.trip_id === 'TRIP-G02')).toMatchObject({ counts_toward: 'committed', actual_cost: 26727.45, variance: round2(26727.45 - total(byId('TRIP-G02'))) });
    expect(r.actuals.trips_completed).toBe(2);
    expect(r.actuals.variance).toBe(round2(r.actuals.actual_total - r.actuals.planned_total));
  });

  it('with data: the unplanned G10 counts at its default-request estimate and the seeded season is over budget', () => {
    const r = rollupSeason(trips, pack.schedule, pack.actuals, settings, data);
    const est = estimateUnplannedTrip(game('G10'), data, settings)!;
    expect(defaultTripRequest(game('G10'), data)).toMatchObject({ players: 70, coaches: 12, support_staff: 12, include_equipment_truck: true });
    expect(est).toBe(26349.58); // = Economy for the default request (matches the contract fixture)
    expect(r.rows.find((x) => x.trip_id === 'TRIP-G10')).toMatchObject({ counts_toward: 'projected', planned_cost: est, selected_label: '' });
    expect(r.projected).toBe(round2(rollupSeason(trips, pack.schedule, pack.actuals, settings).projected + est));
    expect(r.over_budget).toBe(true);
    const overBy = (r.projected - settings.season_travel_budget) / settings.season_travel_budget;
    expect(overBy).toBeGreaterThan(0.03);
    expect(overBy).toBeLessThan(0.06);
  });

  it('a not_started trip adds 0 even when it has no request; approved counts as committed', () => {
    const t = seeded().map((x) => (x.trip_id === 'TRIP-G12' ? { ...x, status: 'approved' as const } : x));
    const r = rollupSeason(t, pack.schedule, pack.actuals, settings);
    expect(r.rows.find((x) => x.trip_id === 'TRIP-G12')!.counts_toward).toBe('committed');
    expect(r.projected).toBe(r.committed);
  });
});

describe('savingsCandidates / applySavings', () => {
  // demo state: G10 planned as Balanced (draft), G12 draft Game-Ready
  const g10Req: TripRequest = { ...seeds.find((s) => s.trip_id === 'TRIP-G12')!.request!, game_id: 'G10' };
  const trips = seeded().map((t) => (t.trip_id === 'TRIP-G10' ? makeTrip({ trip_id: 'TRIP-G10', game_id: 'G10', status: 'draft', request: g10Req, selected_tier: 'B' }) : t));
  const cands = savingsCandidates(trips, pack.schedule, data, settings);

  it('only draft/approved trips; ids sequential by savings desc; code descriptions', () => {
    for (const c of cands) SavingsCandidate.parse(c);
    expect(new Set(cands.map((c) => c.trip_id))).toEqual(new Set(['TRIP-G10', 'TRIP-G12']));
    expect(cands.map((c) => c.candidate_id)).toEqual(cands.map((_, i) => `SAV-${i + 1}`));
    for (let i = 1; i < cands.length; i++) expect(cands[i]!.savings).toBeLessThanOrEqual(cands[i - 1]!.savings);
    expect(cands[0]).toMatchObject({ kind: 'switch_package', trip_id: 'TRIP-G12', description: 'Buffalo: switch Game-Ready → Economy', new_option_id: 'PKG-G12-A' });
    const g12 = trips.find((t) => t.trip_id === 'TRIP-G12')!;
    expect(cands[0]!.savings).toBe(round2(total(g12) - g12.packages[0]!.costs.total));
    expect(cands.map((c) => c.kind)).toEqual(expect.arrayContaining(['switch_package', 'reduce_travelers', 'cheaper_hotel']));
    expect(cands.find((c) => c.kind === 'reduce_travelers' && c.trip_id === 'TRIP-G12')!.description).toBe('Buffalo: travel 5 fewer players');
    expect(cands.find((c) => c.kind === 'cheaper_hotel' && c.trip_id === 'TRIP-G12')!.description).toMatch(/^Buffalo: use .+ instead of Bluestem Inn Buffalo$/);
  });

  it('never for completed or published trips', () => {
    const published = trips.map((t) => (t.status === 'draft' ? { ...t, status: 'published' as const } : t));
    expect(savingsCandidates(published, pack.schedule, data, settings)).toEqual([]);
  });

  it('applySavings: one switch per trip (largest wins), others additive; unknown ids throw', () => {
    const r = rollupSeason(trips, pack.schedule, pack.actuals, settings, data);
    const g12Switches = cands.filter((c) => c.trip_id === 'TRIP-G12' && c.kind === 'switch_package');
    expect(g12Switches.length).toBeGreaterThanOrEqual(2);
    const both = applySavings(r, cands, g12Switches.map((c) => c.candidate_id));
    expect(both.total_savings).toBe(g12Switches[0]!.savings);
    const all = applySavings(r, cands, cands.map((c) => c.candidate_id));
    const expected = round2(cands.filter((c) => c.kind !== 'switch_package' || cands.find((x) => x.trip_id === c.trip_id && x.kind === 'switch_package') === c).reduce((s, c) => s + c.savings, 0));
    expect(all.total_savings).toBe(expected);
    expect(all.projected_after).toBe(round2(r.projected - expected));
    expect(() => applySavings(r, cands, ['SAV-999'])).toThrow(/SAV-999/);
  });

  it('demo: after planning G10 (Balanced) the season is over budget and savings bring it back under', () => {
    const r = rollupSeason(trips, pack.schedule, pack.actuals, settings, data);
    expect(r.over_budget).toBe(true);
    const top = applySavings(r, cands, cands.filter((c) => c.kind === 'switch_package').map((c) => c.candidate_id));
    expect(top.projected_after).toBeLessThan(settings.season_travel_budget);
  });
});

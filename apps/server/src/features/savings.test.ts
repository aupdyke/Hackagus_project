/** A-16: AI picks savings ids; code verifies, recomputes, guards the prose; apply changes real trips. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiErrorBody, SavingsResult, SeasonRollup } from '@falcon/shared';

vi.mock('../aivana/client', async (orig) => {
  const real = await orig<typeof import('../aivana/client')>();
  return { ...real, generateStructured: vi.fn(real.generateStructured) };
});

const { generateStructured } = await import('../aivana/client');
const { AiError } = await import('../aivana/errors');
const { call, startTestServer } = await import('../test/server');
const { repo, seedIfEmpty } = await import('../repo');
const { computeTripPackages } = await import('./planner');
const { SAVINGS_SYSTEM, WITHIN_BUDGET, currentSeason, greedySelection, verifySelection } = await import('./savings');

const gen = vi.mocked(generateStructured);
const META = { request_id: 'm', usage: { input_tokens: 0, cached_tokens: 0, output_tokens: 0, credits: 0 }, latency_ms: 0, finish_reason: 'stop', attempts: 1, mock: true, notices: [] };
let srv: Awaited<ReturnType<typeof startTestServer>>;
const savings = async () => {
  const r = await call(srv.url, 'POST', '/season/savings', {});
  expect(r.status).toBe(200);
  return SavingsResult.parse(r.json);
};
const apply = (ids: string[]) => call(srv.url, 'POST', '/season/savings/apply', { candidate_ids: ids });
const reseed = () => seedIfEmpty(computeTripPackages, true);

beforeAll(async () => {
  srv = await startTestServer();
});
afterAll(async () => {
  await srv?.close();
});
beforeEach(() => {
  gen.mockClear();
  reseed();
});

describe('POST /season/savings', () => {
  it('a clean AI answer is used as-is', async () => {
    gen.mockResolvedValueOnce({ data: { selected_candidate_ids: ['SAV-1'], explanation: 'SAV-1 moves Buffalo to Economy, which alone closes the gap.' }, meta: META });
    const r = await savings();
    expect(r).toMatchObject({ source: 'ai', selected_candidate_ids: ['SAV-1'], explanation: 'SAV-1 moves Buffalo to Economy, which alone closes the gap.', fact_guard: { passed: true, replaced: false, issues: [] } });
  });

  it('AI down → greedy template that stops once under budget', async () => {
    gen.mockRejectedValueOnce(new AiError('ai_unavailable', 'down', true, 503));
    const r = await savings();
    const { rollup, candidates } = currentSeason();
    expect(rollup.over_budget).toBe(true);
    expect(r.source).toBe('template');
    expect(r.selected_candidate_ids).toEqual(['SAV-1']); // G12 → Economy alone gets under $170,000
    expect(candidates[0]!.description).toBe('Buffalo: switch Game-Ready → Economy');
    expect(r.projected_before).toBe(rollup.projected);
    expect(r.total_savings).toBe(candidates[0]!.savings);
    expect(r.projected_after).toBe(Math.round((rollup.projected - candidates[0]!.savings) * 100) / 100);
    expect(r.back_under_budget).toBe(true);
    expect(r.explanation).toMatch(/^Selected SAV-1 \(Buffalo: switch Game-Ready → Economy\): together about \$[\d,]+ in estimated savings, bringing the projection to \$[\d,]+, under the \$170,000 budget\.$/);
  });

  it('mock AI: ids verified — a second package change on the same trip is dropped', async () => {
    const r = await savings();
    expect(r.source).toBe('ai');
    expect(r.selected_candidate_ids).toEqual(['SAV-1', ...r.selected_candidate_ids.slice(1)]);
    const g12Changes = r.candidates.filter((c) => r.selected_candidate_ids.includes(c.candidate_id) && c.trip_id === 'TRIP-G12' && c.kind !== 'reduce_travelers');
    expect(g12Changes).toHaveLength(1);
    // the mock's prose names the dropped ids too → replaced by code prose describing the real selection
    expect(r.fact_guard.replaced).toBe(true);
    expect(r.fact_guard.issues.some((i) => /dropped/.test(i))).toBe(true);
    expect(r.explanation.startsWith('Selected SAV-1 (')).toBe(true);
    expect(r.explanation).not.toMatch(/SAV-2|SAV-3/);
    expect(r.back_under_budget).toBe(true);
    const opts = gen.mock.calls[0]![2];
    expect(opts.prompt).toMatch(/^FACTS: \{"budget":170000,"projected":/);
    expect(opts.prompt).toContain('"trip":"Buffalo"');
    expect(SAVINGS_SYSTEM.split(/\s+/).length).toBeLessThan(150);
  });

  it('invented $ in the explanation → one retry, then template prose (AI ids kept)', async () => {
    const bad = { data: { selected_candidate_ids: ['SAV-1'], explanation: 'SAV-1 saves $50,000 easily.' }, meta: META };
    gen.mockResolvedValueOnce(bad).mockResolvedValueOnce(bad);
    const r = await savings();
    expect(gen).toHaveBeenCalledTimes(2);
    expect(String(gen.mock.calls[1]![2].prompt)).toMatch(/CORRECTION: your previous answer used values not in FACTS \(\$50,000 is not in the facts\)/);
    expect(r).toMatchObject({ source: 'ai', selected_candidate_ids: ['SAV-1'], fact_guard: { passed: false, replaced: true } });
    expect(r.explanation).not.toContain('50,000');
    expect(r.explanation.startsWith('Selected SAV-1 (')).toBe(true);
  });

  it('unknown ids only → template selection', async () => {
    gen.mockResolvedValueOnce({ data: { selected_candidate_ids: ['SAV-99'], explanation: 'SAV-99.' }, meta: META });
    const r = await savings();
    expect(r).toMatchObject({ source: 'template', selected_candidate_ids: ['SAV-1'], fact_guard: { replaced: true } });
  });

  it('within budget → no AI call, nothing selected', async () => {
    repo.settings.save({ ...repo.settings.get(), season_travel_budget: 500000 });
    const r = await savings();
    expect(r).toMatchObject({ selected_candidate_ids: [], explanation: WITHIN_BUDGET, back_under_budget: true, source: 'template' });
    expect(gen).not.toHaveBeenCalled();
  });
});

describe('POST /season/savings/apply', () => {
  it("switch_package changes G12's selection and lowers projected", async () => {
    const before = currentSeason();
    const sw = before.candidates.find((c) => c.kind === 'switch_package' && c.new_option_id === 'PKG-G12-A')!;
    const r = await apply([sw.candidate_id]);
    expect(r.status).toBe(200);
    const after = SeasonRollup.parse(r.json);
    expect(repo.trips.get('TRIP-G12')!.selected_option_id).toBe('PKG-G12-A');
    expect(after.projected).toBe(Math.round((before.rollup.projected - sw.savings) * 100) / 100);
    expect(after.over_budget).toBe(false);
  });

  it('reduce_travelers and cheaper_hotel rebuild the trip in the same tier', async () => {
    const { candidates } = currentSeason();
    const red = candidates.find((c) => c.kind === 'reduce_travelers' && c.trip_id === 'TRIP-G12')!;
    const hot = candidates.find((c) => c.kind === 'cheaper_hotel' && c.trip_id === 'TRIP-G12')!;
    const oldHotel = repo.trips.get('TRIP-G12')!.packages.find((p) => p.tier === 'C')!.hotel_id;
    expect((await apply([red.candidate_id, hot.candidate_id])).status).toBe(200);
    const t = repo.trips.get('TRIP-G12')!;
    expect(t.request!.players).toBe(65);
    expect(t.request!.excluded_hotel_ids).toContain(oldHotel);
    expect(t.selected_option_id).toBe('PKG-G12-C');
    expect(t.packages.find((p) => p.tier === 'C')!.hotel_id).not.toBe(oldHotel);
    expect(t.recommendation).toBeNull();
  });

  it('unknown id → 400 and nothing changes', async () => {
    const before = repo.trips.get('TRIP-G12')!;
    const r = await apply(['SAV-1', 'SAV-404']);
    expect(r.status).toBe(400);
    expect(ApiErrorBody.parse(r.json).error.message).toMatch(/SAV-404/);
    expect(repo.trips.get('TRIP-G12')!.selected_option_id).toBe(before.selected_option_id);
  });
});

describe('pure helpers', () => {
  it('verifySelection and greedySelection', () => {
    const { rollup, candidates } = currentSeason();
    const ids = candidates.map((c) => c.candidate_id);
    const v = verifySelection([...ids, 'SAV-404', ids[0]!], candidates);
    expect(v.dropped).toContain('SAV-404');
    const changes = candidates.filter((c) => v.ids.includes(c.candidate_id) && c.kind !== 'reduce_travelers');
    expect(new Set(changes.map((c) => c.trip_id)).size).toBe(changes.length);
    expect(greedySelection({ ...rollup, projected: rollup.budget }, candidates)).toEqual([]);
    const all = greedySelection({ ...rollup, budget: 0 }, candidates);
    expect(all.length).toBeGreaterThan(1); // keeps going while still over, skipping conflicts
  });
});

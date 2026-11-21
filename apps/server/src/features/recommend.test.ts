/** A-05: recommendation validation/finalize (pure) + route in mock mode + AI-down / retry paths. */
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Recommendation, recommendFacts, type AiRecommendOut, type Trip } from '@falcon/shared';

vi.mock('../aivana/client', async (orig) => {
  const real = await orig<typeof import('../aivana/client')>();
  return { ...real, generateStructured: vi.fn(real.generateStructured) };
});

const { generateStructured } = await import('../aivana/client');
const { AiError } = await import('../aivana/errors');
const { createApp } = await import('../app');
const { repo, seedIfEmpty } = await import('../repo');
const { computeTripPackages } = await import('./planner');
const { pack } = await import('../data');
const { checkRecommendation, finalizeRecommendation, recommendTrip } = await import('./recommend');

const gen = vi.mocked(generateStructured);
const NOW = '2026-11-20T12:00:00.000Z';
let trip: Trip;
let server: Server;
let base: string;

beforeAll(async () => {
  seedIfEmpty(computeTripPackages);
  trip = repo.trips.get('TRIP-G12')!;
  server = createApp().listen(0);
  await new Promise<void>((r) => server.once('listening', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server?.close());

const game = () => pack.schedule.find((g) => g.game_id === 'G12')!;
const hotels = () => pack.hotels;
const allowed = () => recommendFacts(game(), trip.request!, trip.packages, hotels()).allowed;
const good = (): AiRecommendOut => ({
  recommended_option_id: 'PKG-G12-B',
  ranking: ['PKG-G12-B', 'PKG-G12-A', 'PKG-G12-C'],
  tradeoffs: [
    { option_id: 'PKG-G12-A', pros: ['Lowest total estimate'], cons: ['Farthest hotel'] },
    { option_id: 'PKG-G12-B', pros: [`About ${trip.packages[1]!.costs.total.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} total`], cons: [] },
  ],
  explanation: 'PKG-G12-B balances cost and readiness.',
});

describe('checkRecommendation / finalizeRecommendation (pure)', () => {
  it('valid answer → source ai, ranking normalised to all options', () => {
    expect(checkRecommendation(good(), trip.packages, allowed())).toEqual({ ok: true, pickOk: true, issues: [] });
    const rec = finalizeRecommendation({ ...good(), ranking: ['PKG-G12-B'] }, trip.packages, allowed(), NOW, hotels());
    Recommendation.parse(rec);
    expect(rec).toMatchObject({ recommended_option_id: 'PKG-G12-B', source: 'ai', fact_guard: { passed: true, replaced: false } });
    expect(rec.ranking).toHaveLength(3);
    expect(rec.ranking[0]).toBe('PKG-G12-B');
  });

  it('invalid id → template pick and prose', () => {
    const rec = finalizeRecommendation({ ...good(), recommended_option_id: 'PKG-G12-D' }, trip.packages, allowed(), NOW, hotels());
    expect(rec.source).toBe('template');
    expect(trip.packages.map((p) => p.option_id)).toContain(rec.recommended_option_id);
    expect(rec.fact_guard).toMatchObject({ passed: false, replaced: true });
    expect(rec.fact_guard.issues[0]).toMatch(/PKG-G12-D is not an option id/);
  });

  it('infeasible pick is rejected while a feasible option exists', () => {
    const pkgs = trip.packages.map((p) => (p.tier === 'B' ? { ...p, feasible: false } : p));
    const c = checkRecommendation(good(), pkgs, allowed());
    expect(c.pickOk).toBe(false);
    const rec = finalizeRecommendation(good(), pkgs, allowed(), NOW, hotels());
    expect(rec.recommended_option_id).not.toBe('PKG-G12-B');
    expect(pkgs.find((p) => p.option_id === rec.recommended_option_id)!.feasible).toBe(true);
  });

  it('invented $ → prose replaced, valid AI pick kept', () => {
    const ai = { ...good(), explanation: 'PKG-G12-B is only $9,999 and saves a ton.' };
    const rec = finalizeRecommendation(ai, trip.packages, allowed(), NOW, hotels());
    expect(rec.recommended_option_id).toBe('PKG-G12-B');
    expect(rec.source).toBe('ai');
    expect(rec.fact_guard).toEqual({ passed: false, replaced: true, issues: ['$9,999 is not in the facts'] });
    expect(rec.explanation).not.toMatch(/9,999/);
    expect(rec.explanation.startsWith('PKG-G12-B (Balanced)')).toBe(true);
  });

  it('invented number in a con, bad ranking and tradeoff ids are all failures', () => {
    const c = checkRecommendation(
      { ...good(), ranking: ['PKG-G12-B', 'PKG-G12-B'], tradeoffs: [{ option_id: 'PKG-X-A', pros: [], cons: ['Needs 4 buses'] }] },
      trip.packages, allowed(),
    );
    expect(c.ok).toBe(false);
    expect(c.issues).toEqual(expect.arrayContaining(['ranking repeats an option id', 'tradeoffs have unknown ids: PKG-X-A', '4 buses is not in the facts']));
  });
});

describe('recommendTrip (AI paths)', () => {
  it('AI error → template recommendation', async () => {
    gen.mockRejectedValueOnce(new AiError('ai_unavailable', 'down', true, 502));
    const rec = await recommendTrip(trip, game(), NOW);
    expect(rec.source).toBe('template');
    expect(rec.fact_guard.passed).toBe(true);
  });

  it('bad first answer → one retry with a CORRECTION note → AI result', async () => {
    gen.mockClear();
    const meta = { request_id: 'x', usage: { input_tokens: 0, cached_tokens: 0, output_tokens: 0, credits: 0 }, latency_ms: 0, finish_reason: 'stop', attempts: 1, mock: true, notices: [] };
    gen.mockResolvedValueOnce({ data: { ...good(), explanation: 'Costs $1 only.' }, meta }).mockResolvedValueOnce({ data: good(), meta });
    const rec = await recommendTrip(trip, game(), NOW);
    expect(gen).toHaveBeenCalledTimes(2);
    expect(String(gen.mock.calls[1]![2].prompt)).toMatch(/CORRECTION: your previous answer used values not in FACTS \(\$1 is not in the facts\)\. Use only FACTS\./);
    expect(rec).toMatchObject({ source: 'ai', fact_guard: { passed: true, replaced: false } });
  });

  it('system prompt stays under ~150 words', async () => {
    const { RECOMMEND_SYSTEM } = await import('./recommend');
    expect(RECOMMEND_SYSTEM.split(/\s+/).length).toBeLessThan(150);
  });
});

describe('POST /trips/:id/recommend (mock mode)', () => {
  it('returns source ai with a valid, feasible id and saves it on the trip', async () => {
    const r = await fetch(`${base}/trips/TRIP-G12/recommend`, { method: 'POST', headers: { 'x-role': 'staff' } });
    expect(r.status).toBe(200);
    expect(r.headers.get('x-fixture')).toBeNull();
    const rec = Recommendation.parse(await r.json());
    expect(rec.source).toBe('ai');
    const pick = trip.packages.find((p) => p.option_id === rec.recommended_option_id);
    expect(pick?.feasible).toBe(true);
    expect(repo.trips.get('TRIP-G12')!.recommendation?.recommended_option_id).toBe(rec.recommended_option_id);
  });
});

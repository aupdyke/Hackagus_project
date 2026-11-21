/** A-14: athlete assistant — citations, needs_staff, fact guard, history trim, AI-down fallback, scoping. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantReply } from '@falcon/shared';

vi.mock('../aivana/client', async (orig) => {
  const real = await orig<typeof import('../aivana/client')>();
  return { ...real, generateStructured: vi.fn(real.generateStructured) };
});

const { generateStructured } = await import('../aivana/client');
const { AiError } = await import('../aivana/errors');
const { call, startTestServer } = await import('../test/server');
const { repo } = await import('../repo');
const { pack, playerName } = await import('../data');
const { AI_DOWN_ANSWER, NO_TRIP_ANSWER, UNVERIFIED_ANSWER } = await import('./assistant');

const gen = vi.mocked(generateStructured);
const META = { request_id: 'm', usage: { input_tokens: 0, cached_tokens: 0, output_tokens: 0, credits: 0 }, latency_ms: 0, finish_reason: 'stop', attempts: 1, mock: true, notices: [] };
let srv: Awaited<ReturnType<typeof startTestServer>>;
let me: string;
const ask = async (message: string, history: unknown[] = [], as = me, id = me) => {
  const r = await call(srv.url, 'POST', `/athletes/${id}/assistant`, { message, history }, { 'x-role': 'athlete', 'x-athlete-id': as });
  return { status: r.status, reply: r.status === 200 ? AssistantReply.parse(r.json) : null };
};

beforeAll(async () => {
  srv = await startTestServer();
  expect((await call(srv.url, 'POST', '/trips/TRIP-G12/approve')).status).toBe(200);
  expect((await call(srv.url, 'POST', '/trips/TRIP-G12/publish')).status).toBe(200);
  me = repo.trips.get('TRIP-G12')!.traveling_player_ids[0]!;
});
afterAll(async () => {
  await srv?.close();
});
beforeEach(() => {
  gen.mockClear();
});

describe('POST /athletes/:id/assistant (mock)', () => {
  it('"Who\'s my roommate?" cites F-room', async () => {
    const { reply } = await ask("Who's my roommate?");
    expect(reply!.cited_fact_ids).toEqual(['F-room']);
    expect(reply!.citations[0]!.text).toMatch(/^Your room RM-\d+ with /);
    expect(reply).toMatchObject({ needs_staff: false, source: 'ai', fact_guard: { passed: true, replaced: false } });
  });

  it('"when do we leave?" cites the departure item', async () => {
    const { reply } = await ask('when do we leave?');
    expect(reply!.cited_fact_ids).toEqual(['IT-1']);
    expect(reply!.answer).toMatch(/^Buses depart — Fri Dec 11, 9:00 AM/);
  });

  it('"What\'s the WiFi password?" → needs_staff', async () => {
    const { reply } = await ask("What's the WiFi password?");
    expect(reply!.needs_staff).toBe(true);
    expect(reply!.cited_fact_ids).toEqual([]);
  });

  it("only this athlete's facts are sent; history trimmed to 6 turns", async () => {
    const history = Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `turn ${i}` }));
    await ask('when is kickoff?', history);
    const opts = gen.mock.calls[0]![2];
    expect(opts.messages).toHaveLength(7);
    expect(opts.messages![0]!.content).toBe('turn 4');
    expect(opts).toMatchObject({ feature: 'assistant', max_tokens: 300, temperature: 0 });
    const t = repo.trips.get('TRIP-G12')!;
    const room = t.rooming!.rooms.find((r) => r.occupant_ids.includes(me))!;
    const stranger = t.traveling_player_ids.find((id) => !room.occupant_ids.includes(id))!;
    expect(opts.system).not.toContain(playerName(stranger));
    expect(opts.system!.split('FACTS:')[0]!.split(/\s+/).length).toBeLessThan(150);
  });

  it('unverifiable answer is replaced and flagged', async () => {
    gen.mockResolvedValueOnce({ data: { answer: 'Buses leave at 3:15 AM.', cited_fact_ids: ['IT-1'], needs_staff: false }, meta: META });
    const { reply } = await ask('when do we leave?');
    expect(reply).toMatchObject({ answer: UNVERIFIED_ANSWER, needs_staff: true, citations: [], fact_guard: { passed: false, replaced: true } });
    expect(reply!.fact_guard.issues).toContain('3:15 AM is not in the facts');
  });

  it('unknown cited ids are dropped; no citations without needs_staff → replaced', async () => {
    gen.mockResolvedValueOnce({ data: { answer: 'You are on Bus 1 or 2.', cited_fact_ids: ['F-nope', 'F-bus'], needs_staff: false }, meta: META });
    const a = (await ask('which bus?')).reply!;
    expect(a.cited_fact_ids).toEqual(['F-bus']);
    expect(a.fact_guard).toEqual({ passed: false, replaced: false, issues: ['F-nope is not a fact id'] });
    gen.mockResolvedValueOnce({ data: { answer: 'Probably the big one.', cited_fact_ids: [], needs_staff: false }, meta: META });
    expect((await ask('which bus?')).reply).toMatchObject({ answer: UNVERIFIED_ANSWER, needs_staff: true });
  });

  it('AI down → keyword fallback or "AI is unavailable"', async () => {
    gen.mockRejectedValueOnce(new AiError('ai_unavailable', 'down', true, 503));
    expect((await ask('what bus am I on?')).reply).toMatchObject({ cited_fact_ids: ['F-bus'], source: 'fallback', needs_staff: false });
    gen.mockRejectedValueOnce(new AiError('ai_credits_empty', 'x', false, 402));
    expect((await ask('who is my roommate')).reply!.cited_fact_ids).toEqual(['F-room']);
    gen.mockRejectedValueOnce(new AiError('ai_busy', 'x', true, 429));
    expect((await ask('where is dinner?')).reply!.cited_fact_ids[0]).toMatch(/^F-meal-ML-\d+$/);
    gen.mockRejectedValueOnce(new AiError('ai_busy', 'x', true, 429));
    expect((await ask('tell me a joke')).reply).toMatchObject({ answer: AI_DOWN_ANSWER, needs_staff: true, source: 'fallback' });
  });

  it('no published trip → ask a coach, no AI call', async () => {
    const benched = pack.roster.find((p) => !repo.trips.get('TRIP-G12')!.traveling_player_ids.includes(p.id))!.id;
    const { reply } = await ask('when do we leave?', [], benched, benched);
    expect(reply).toMatchObject({ answer: NO_TRIP_ANSWER, needs_staff: true, source: 'fallback' });
    expect(gen).not.toHaveBeenCalled();
  });

  it("an athlete cannot query another athlete's id → 403", async () => {
    const other = repo.trips.get('TRIP-G12')!.traveling_player_ids[1]!;
    expect((await ask('who is my roommate?', [], me, other)).status).toBe(403);
  });
});

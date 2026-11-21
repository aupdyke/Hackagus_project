/** A-07: what-if route in mock mode + AI-down + invalid ops + history trimming + reply guard. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { WhatIfResponse, type AiWhatIfOut } from '@falcon/shared';

vi.mock('../aivana/client', async (orig) => {
  const real = await orig<typeof import('../aivana/client')>();
  return { ...real, generateStructured: vi.fn(real.generateStructured) };
});

const { generateStructured } = await import('../aivana/client');
const { AiError } = await import('../aivana/errors');
const { startTestServer, call } = await import('../test/server');
const { repo } = await import('../repo');
const { WHATIF_SYSTEM, WHATIF_HISTORY_SENT } = await import('./whatif');

const gen = vi.mocked(generateStructured);
let srv: Awaited<ReturnType<typeof startTestServer>>;
const whatif = (id: string, message: string) => call(srv.url, 'POST', `/trips/${id}/whatif`, { message });
const META = { request_id: 'm', usage: { input_tokens: 0, cached_tokens: 0, output_tokens: 0, credits: 0 }, latency_ms: 0, finish_reason: 'stop', attempts: 1, mock: true, notices: [] };
const OP = { field: '', value: -1, delta: 0, category: '', max: -1, hotel_id: '', criterion: 'none', constraint_kind: '', constraint_day: '', constraint_time_24h: '', bool_value: '' } as const;
const aiAnswer = (o: Partial<AiWhatIfOut>): { data: AiWhatIfOut; meta: typeof META } => ({
  data: { reply: 'Done.', needs_clarification: false, clarifying_question: '', patch_ops: [], ...o }, meta: META,
});

beforeAll(async () => {
  srv = await startTestServer();
});
afterAll(async () => {
  await srv?.close();
});
beforeEach(() => {
  gen.mockClear();
});

describe('POST /trips/:id/whatif', () => {
  it('mock: "leave three players home" → players −3, every option diffed, trip has the new request', async () => {
    const before = repo.trips.get('TRIP-G12')!;
    const r = await whatif('TRIP-G12', 'leave three players home');
    expect(r.status).toBe(200);
    const out = WhatIfResponse.parse(r.json);
    expect(out).toMatchObject({ applied: true, source: 'ai', needs_clarification: false });
    expect(out.patch_ops).toEqual([{ op: 'adjust_count', field: 'players', delta: -3 }]);
    expect(out.trip.request!.players).toBe(before.request!.players - 3);
    expect(out.diff.map((d) => d.option_id)).toEqual(before.packages.map((p) => p.option_id));
    for (const d of out.diff) expect(d.changes).toContain(`Players ${before.request!.players} → ${before.request!.players - 3}`);
    expect(out.trip.recommendation).toBeNull();
    expect(out.trip.whatif_history.slice(-2).map((t) => t.role)).toEqual(['user', 'assistant']);
    expect(repo.trips.get('TRIP-G12')!.request!.players).toBe(before.request!.players - 3);
  });

  it('invalid hotel id is rejected with a reason; nothing applied', async () => {
    gen.mockResolvedValueOnce(aiAnswer({ reply: 'Excluding that hotel.', patch_ops: [{ ...OP, op: 'exclude_hotel', hotel_id: 'H-ATH-1' }] }));
    const before = repo.trips.get('TRIP-G12')!;
    const out = WhatIfResponse.parse((await whatif('TRIP-G12', 'skip the Athens hotel')).json);
    expect(out.applied).toBe(false);
    expect(out.rejected_ops).toEqual([{ op: expect.objectContaining({ hotel_id: 'H-ATH-1' }), reason: 'Hotel "H-ATH-1" is not a Buffalo hotel' }]);
    expect(out.reply).toMatch(/couldn't apply/);
    expect(out.trip.request).toEqual(before.request);
  });

  it('reply with invented numbers is replaced by a code summary', async () => {
    gen.mockResolvedValueOnce(aiAnswer({ reply: 'Done — that saves $12,345 and 7 rooms.', patch_ops: [{ ...OP, op: 'set_equipment_truck', bool_value: 'no' }] }));
    const out = WhatIfResponse.parse((await whatif('TRIP-G12', 'drop the truck')).json);
    expect(out.applied).toBe(true);
    expect(out.reply).toBe('Applied: Equipment truck removed. Recomputed all packages.');
    expect(out.trip.request!.include_equipment_truck).toBe(false);
  });

  it('needs_clarification → question returned, trip unchanged', async () => {
    const before = repo.trips.get('TRIP-G12')!;
    const out = WhatIfResponse.parse((await whatif('TRIP-G12', 'make it better')).json);
    expect(out).toMatchObject({ needs_clarification: true, applied: false, patch_ops: [] });
    expect(out.clarifying_question.length).toBeGreaterThan(0);
    expect(out.trip.request).toEqual(before.request);
    expect(out.trip.packages).toEqual(before.packages);
  });

  it('AI down → 200 fallback with the friendly message, trip unchanged', async () => {
    gen.mockRejectedValueOnce(new AiError('ai_credits_empty', 'no credit', false, 402));
    const before = repo.trips.get('TRIP-G12')!;
    const r = await whatif('TRIP-G12', 'leave two players home');
    expect(r.status).toBe(200);
    const out = WhatIfResponse.parse(r.json);
    expect(out).toMatchObject({ source: 'fallback', applied: false });
    expect(out.reply).toMatch(/credits/i);
    expect(out.trip.request).toEqual(before.request);
  });

  it('sends at most 8 history turns + the new message, with a short system prompt and FACTS', async () => {
    const t = repo.trips.get('TRIP-G12')!;
    repo.trips.save({ ...t, whatif_history: Array.from({ length: 14 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `turn ${i}` }) as const) });
    await whatif('TRIP-G12', 'no truck');
    const opts = gen.mock.calls[0]![2];
    expect(opts.messages).toHaveLength(WHATIF_HISTORY_SENT + 1);
    expect(opts.messages![0]!.content).toBe('turn 6');
    expect(opts.messages!.at(-1)!.content).toMatch(/^FACTS: \{.*"hotels":\[.*H-BUF-1.*\nREQUEST: no truck$/s);
    expect(opts).toMatchObject({ feature: 'whatif', max_tokens: 500, temperature: 0 });
    expect(WHATIF_SYSTEM.split(/\s+/).length).toBeLessThan(150);
    expect(repo.trips.get('TRIP-G12')!.whatif_history.length).toBeLessThanOrEqual(20);
  });

  it('approved trip goes back to draft; completed → 409; no request → 409', async () => {
    const t = repo.trips.get('TRIP-G12')!;
    repo.trips.save({ ...t, status: 'approved' });
    const out = WhatIfResponse.parse((await whatif('TRIP-G12', 'leave one players home')).json);
    expect(out.trip.status).toBe('draft');
    expect((await whatif('TRIP-G02', 'leave three players home')).status).toBe(409);
    expect((await whatif('TRIP-G10', 'leave three players home')).status).toBe(409); // not started, no request
    expect((await call(srv.url, 'POST', '/trips/TRIP-G12/whatif', { message: '' })).status).toBe(400);
  });
});

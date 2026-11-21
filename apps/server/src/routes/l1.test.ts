/** A-06: Level-1 server tests — bad input, AI failures, human-review flow, error shape. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiErrorBody, ParseResult, Recommendation, TripDetail, TripSummary, type TripRequest } from '@falcon/shared';

vi.mock('../aivana/client', async (orig) => {
  const real = await orig<typeof import('../aivana/client')>();
  return { ...real, generateStructured: vi.fn(real.generateStructured) };
});

const { generateStructured } = await import('../aivana/client');
const { AiError } = await import('../aivana/errors');
const { startTestServer, call } = await import('../test/server');
type Srv = Awaited<ReturnType<typeof startTestServer>>;

const gen = vi.mocked(generateStructured);
const DEMO = "Ohio trip: 68 players, 12 coaches, 11 support staff, bring the equipment truck, can't leave before 2 PM Friday";
const G10_REQ: TripRequest = {
  game_id: 'G10', players: 70, coaches: 12, support_staff: 12,
  departure_constraint: { kind: 'not_before', datetime_local: '2026-11-27T14:00', raw_text: "can't leave before 2 PM Friday" },
  include_equipment_truck: true,
  caps: { lodging: null, meals: null, bus: null, total: null },
  excluded_hotel_ids: [], preference: 'none', notes: '',
};
const withReq = (patch: Partial<TripRequest>): TripRequest => ({ ...G10_REQ, ...patch });

let srv: Srv;
const get = (path: string, headers?: Record<string, string>) => call(srv.url, 'GET', path, undefined, headers);
const post = (path: string, body?: unknown, headers?: Record<string, string>) => call(srv.url, 'POST', path, body, headers);

function expectError(r: { status: number; json: unknown }, status: number, code?: string) {
  expect(r.status).toBe(status);
  const body = ApiErrorBody.parse(r.json);
  if (code) expect(body.error.code).toBe(code);
  expect(typeof body.error.message).toBe('string');
  expect(typeof body.error.retryable).toBe('boolean');
  return body.error;
}

beforeAll(async () => {
  srv = await startTestServer();
});
afterAll(async () => {
  await srv?.close();
});
beforeEach(() => {
  gen.mockClear();
});

describe('basics', () => {
  it('health', async () => {
    const r = await get('/health');
    expect(r.status).toBe(200);
  });

  it('lists the 6 away trips, sorted by date', async () => {
    const r = await get('/trips');
    expect(r.status).toBe(200);
    const trips = TripSummary.array().parse(r.json);
    expect(trips).toHaveLength(6);
    expect(trips.map((t) => t.date)).toEqual([...trips.map((t) => t.date)].sort());
  });

  it('unknown trip → 404; athlete role on /trips → 403', async () => {
    expectError(await get('/trips/TRIP-NOPE'), 404, 'not_found');
    expectError(await get('/trips', { 'x-role': 'athlete', 'x-athlete-id': 'P-001' }), 403, 'forbidden');
  });
});

describe('parse (human review)', () => {
  it('mock parse of the demo sentence → G10, no missing fields', async () => {
    const r = await post('/trips/parse', { text: DEMO });
    expect(r.status).toBe(200);
    const p = ParseResult.parse(r.json);
    expect(p.source).toBe('ai');
    expect(p.draft.game_id).toBe('G10');
    expect(p.draft).toMatchObject({ players: 68, coaches: 12, support_staff: 11, include_equipment_truck: true });
    expect(p.draft.departure_constraint).toMatchObject({ kind: 'not_before', datetime_local: '2026-11-27T14:00' });
    expect(p.missing_fields).toEqual([]);
  });

  it('AI credits empty → 200 fallback draft with a credits notice', async () => {
    gen.mockRejectedValueOnce(new AiError('ai_credits_empty', 'insufficient_credit', false, 402, 'req-402'));
    const r = await post('/trips/parse', { text: DEMO });
    expect(r.status).toBe(200);
    const p = ParseResult.parse(r.json);
    expect(p.source).toBe('fallback');
    expect(p.notice).toMatch(/credits/i);
    expect(p.draft.notes).toContain('Ohio trip');
  });

  it.each(['ai_busy', 'ai_unavailable', 'ai_bad_output', 'ai_auth'] as const)('%s never blocks parse (fallback)', async (code) => {
    gen.mockRejectedValueOnce(new AiError(code, 'x', true, 500));
    const r = await post('/trips/parse', { text: DEMO });
    expect(r.status).toBe(200);
    expect(ParseResult.parse(r.json).source).toBe('fallback');
  });

  it('empty / wrong-typed parse bodies → 400', async () => {
    expectError(await post('/trips/parse', {}), 400);
    expectError(await post('/trips/parse', { text: 42 }), 400);
  });
});

describe('submitRequest validation', () => {
  it('home game → 400', async () => {
    const e = expectError(await post('/trips/G01/request', withReq({ game_id: 'G01' })), 400, 'validation_failed');
    expect(e.message).toMatch(/home game/);
  });
  it('unknown game → 404', async () => {
    expectError(await post('/trips/G99/request', withReq({ game_id: 'G99' })), 404, 'not_found');
  });
  it('mismatched game_id → 400', async () => {
    expectError(await post('/trips/G10/request', withReq({ game_id: 'G12' })), 400, 'validation_failed');
  });
  it('constraint without datetime → 400', async () => {
    const e = expectError(await post('/trips/G10/request', withReq({ departure_constraint: { kind: 'not_before', datetime_local: '', raw_text: '' } })), 400);
    expect(e.message).toMatch(/day and time/);
  });
  it('constraint outside the 3-day window or after kickoff → 400', async () => {
    for (const t of ['2026-11-24T10:00', '2026-11-28T12:05', '2026-12-01T09:00']) {
      const e = expectError(await post('/trips/G10/request', withReq({ departure_constraint: { kind: 'not_after', datetime_local: t, raw_text: '' } })), 400);
      expect(e.message).toMatch(/between .* and kickoff/);
    }
    // edges are fine
    const ok = await post('/trips/G10/request', withReq({ departure_constraint: { kind: 'not_after', datetime_local: '2026-11-25T00:00', raw_text: '' } }));
    expect(ok.status).toBe(200);
  });
  it('players 0, 200 and more than eligible → 400', async () => {
    expectError(await post('/trips/G10/request', withReq({ players: 0 })), 400);
    expectError(await post('/trips/G10/request', withReq({ players: 200 })), 400);
    const e = expectError(await post('/trips/G10/request', withReq({ players: 97 })), 400);
    expect(e.message).toMatch(/Only 96 players are travel-eligible/);
  });
  it('excluded hotel not in the game city → 400', async () => {
    const e = expectError(await post('/trips/G10/request', withReq({ excluded_hotel_ids: ['H-BUF-1', 'H-NOPE-1'] })), 400);
    expect(e.message).toMatch(/H-BUF-1, H-NOPE-1/);
  });
  it('malformed JSON → 400 bad_request', async () => {
    expectError(await post('/trips/G10/request', '{"game_id": "G10", '), 400, 'bad_request');
  });
  it('fuzz: odd bodies never 500', async () => {
    const bodies: unknown[] = [
      null, [], 'x', 123, {}, { game_id: 'G10' },
      withReq({ players: -5 }), withReq({ players: 1.5 }), withReq({ coaches: 1e9 }),
      { ...G10_REQ, departure_constraint: { kind: 'sometime', datetime_local: 'tomorrow', raw_text: '' } },
      { ...G10_REQ, departure_constraint: { kind: 'not_before', datetime_local: '2026-13-45T99:99', raw_text: '' } },
      { ...G10_REQ, caps: { lodging: 'cheap' } }, { ...G10_REQ, excluded_hotel_ids: 'H-ATH-1' },
      { ...G10_REQ, preference: 'fastest' }, { ...G10_REQ, notes: { a: 1 } },
    ];
    for (const b of bodies) {
      const r = await post('/trips/G10/request', b === null ? 'null' : b);
      expect(r.status, JSON.stringify(b)).toBe(400);
      ApiErrorBody.parse(r.json);
    }
  });
});

describe('happy path (form → packages → select → approve)', () => {
  it('submit G10 → 3 packages → select B → approve', async () => {
    const sub = await post('/trips/G10/request', G10_REQ);
    expect(sub.status).toBe(200);
    const detail = TripDetail.parse(sub.json);
    expect(sub.headers.get('x-fixture')).toBeNull();
    expect(detail.trip.status).toBe('draft');
    expect(detail.trip.packages.map((p) => p.option_id)).toEqual(['PKG-G10-A', 'PKG-G10-B', 'PKG-G10-C']);
    expect(detail.trip.packages.every((p) => p.feasible && p.costs.total > 0)).toBe(true);

    expectError(await post('/trips/TRIP-G10/approve'), 409, 'conflict'); // nothing selected yet
    expectError(await post('/trips/TRIP-G10/select', { option_id: 'PKG-G10-Z' }), 400);

    const sel = await post('/trips/TRIP-G10/select', { option_id: 'PKG-G10-B' });
    expect(sel.status).toBe(200);
    expect(TripDetail.parse(sel.json).trip.selected_option_id).toBe('PKG-G10-B');

    const ap = await post('/trips/TRIP-G10/approve');
    expect(ap.status).toBe(200);
    expect(TripDetail.parse(ap.json).trip.status).toBe('approved');
  });

  it('completed trip cannot be edited → 409', async () => {
    expectError(await post('/trips/G02/request', withReq({ game_id: 'G02', departure_constraint: { kind: 'none', datetime_local: '', raw_text: '' } })), 409, 'conflict');
  });
});

describe('recommend with AI down', () => {
  it('AI throws → 200 template recommendation', async () => {
    gen.mockRejectedValueOnce(new AiError('ai_unavailable', 'down', true, 503));
    const r = await post('/trips/TRIP-G12/recommend');
    expect(r.status).toBe(200);
    const rec = Recommendation.parse(r.json);
    expect(rec.source).toBe('template');
    expect(rec.recommended_option_id).toMatch(/^PKG-G12-[ABC]$/);
  });
  it('recommend for an unknown trip → 404', async () => {
    expectError(await post('/trips/TRIP-NOPE/recommend'), 404);
  });
});

describe('AiError reaching the error middleware', () => {
  it('always has a request_id, and ai_busy is retryable', async () => {
    const { errorMiddleware } = await import('../http');
    const out: { status?: number; body?: { error: { request_id?: string; retryable: boolean; code: string } } } = {};
    const res = {
      headersSent: false,
      status(s: number) { out.status = s; return this; },
      json(b: never) { out.body = b; return this; },
    } as never;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorMiddleware(new AiError('ai_busy', 'rate limited', false, 429), {} as never, res, () => {});
    expect(out.status).toBe(429);
    expect(out.body!.error.retryable).toBe(true);
    expect(out.body!.error.request_id).toMatch(/^local-/);
    errorMiddleware(new AiError('ai_credits_empty', 'no credit', false, 402, 'req-abc'), {} as never, res, () => {});
    expect(out.status).toBe(402);
    expect(out.body!.error).toMatchObject({ code: 'ai_credits_empty', request_id: 'req-abc', retryable: false });
    warn.mockRestore();
  });
});

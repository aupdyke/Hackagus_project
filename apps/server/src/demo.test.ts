/**
 * A-18: the whole demo script (spec §9) against the real app in mock mode, from a clean DB, no network.
 * Sequential `it` blocks share state — they mirror the on-stage order.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AiUsageSummary, AthleteNotification, AssistantReply, MyTripResponse, Packet, ParseResult, Recommendation, SavingsResult,
  SeasonRollup, StreamEvent, TripDetail, WhatIfResponse, type Trip, type TripRequest,
} from '@falcon/shared';
import { call, startTestServer } from './test/server';

const DEMO = "Ohio trip: 68 players, 12 coaches, 11 support staff, bring the equipment truck, can't leave before 2 PM Friday";

let srv: Awaited<ReturnType<typeof startTestServer>>;
const get = (p: string, h?: Record<string, string>) => call(srv.url, 'GET', p, undefined, h);
const post = (p: string, b?: unknown, h?: Record<string, string>) => call(srv.url, 'POST', p, b, h);
const ok = <T>(r: { status: number; json: unknown }, parse: (x: unknown) => T): T => {
  expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
  return parse(r.json);
};

// shared demo state
let request: TripRequest;
let trip: Trip;
let recommended = '';
let athlete = '';
let athleteHeaders: Record<string, string> = {};
const started = Date.now();

beforeAll(async () => {
  srv = await startTestServer();
});
afterAll(async () => {
  await srv?.close();
});

describe('demo script (mock mode)', () => {
  it('1 · season starts over budget', async () => {
    expect((await post('/dev/reset')).status).toBe(200);
    const season = ok(await get('/season'), (x) => SeasonRollup.parse(x));
    expect(season.over_budget).toBe(true);
  });

  it('2 · free-text request → review → packages → AI recommendation', async () => {
    const parsed = ok(await post('/trips/parse', { text: DEMO }), (x) => ParseResult.parse(x));
    expect(parsed.source).toBe('ai');
    const d = parsed.draft;
    expect(d.game_id).toBe('G10');
    // human review: fill anything the parse left empty
    request = {
      game_id: d.game_id!, players: d.players ?? 70, coaches: d.coaches ?? 12, support_staff: d.support_staff ?? 12,
      departure_constraint: d.departure_constraint, include_equipment_truck: d.include_equipment_truck ?? true,
      caps: { lodging: null, meals: null, bus: null, total: null }, excluded_hotel_ids: [], preference: 'none', notes: '',
    };
    expect(request).toMatchObject({ players: 68, coaches: 12, support_staff: 11, include_equipment_truck: true });
    expect(request.departure_constraint).toMatchObject({ kind: 'not_before', datetime_local: '2026-11-27T14:00' });

    trip = ok(await post('/trips/G10/request', request), (x) => TripDetail.parse(x)).trip;
    expect(trip.packages.map((p) => p.option_id)).toEqual(['PKG-G10-A', 'PKG-G10-B', 'PKG-G10-C']);
    expect(trip.packages.every((p) => p.feasible)).toBe(true);

    const rec = ok(await post('/trips/TRIP-G10/recommend'), (x) => Recommendation.parse(x));
    expect(trip.packages.map((p) => p.option_id)).toContain(rec.recommended_option_id);
    expect(rec.source).toBe('ai');
  });

  it('3 · what-if "leave three players home" → costs update', async () => {
    const before = trip;
    const w = ok(await post('/trips/TRIP-G10/whatif', { message: 'leave three players home' }), (x) => WhatIfResponse.parse(x));
    expect(w.applied).toBe(true);
    expect(w.trip.request!.players).toBe(request.players - 3);
    expect(w.diff).toHaveLength(3);
    for (const d of w.diff) expect(d.delta).toBeLessThan(0);
    expect(w.trip.packages[0]!.costs.total).toBeLessThan(before.packages[0]!.costs.total);
    trip = w.trip;
    // the old recommendation is stale → ask again
    const rec = ok(await post('/trips/TRIP-G10/recommend'), (x) => Recommendation.parse(x));
    recommended = rec.recommended_option_id;
  });

  it('4 · streamed memo', async () => {
    const res = await fetch(`${srv.url}/trips/TRIP-G10/memo/stream`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-role': 'staff' }, body: '{}' });
    expect(res.status).toBe(200);
    const events = (await res.text()).split('\n').filter((l) => l.startsWith('data: ')).map((l) => StreamEvent.parse(JSON.parse(l.slice(6))));
    expect(events.filter((e) => e.type === 'delta').length).toBeGreaterThan(3);
    expect(events.at(-1)!.type).toBe('done');
  });

  it('5 · select → rooming → approve → publish v1', async () => {
    ok(await post('/trips/TRIP-G10/select', { option_id: recommended }), (x) => TripDetail.parse(x));
    ok(await post('/trips/TRIP-G10/rooming/generate'), (x) => x);
    ok(await post('/trips/TRIP-G10/approve'), (x) => TripDetail.parse(x));
    trip = ok(await post('/trips/TRIP-G10/publish'), (x) => TripDetail.parse(x)).trip;
    expect(trip).toMatchObject({ status: 'published', published_version: 1, selected_option_id: recommended });
    expect(trip.traveling_player_ids).toHaveLength(request.players - 3);
  });

  it('6 · athlete My Trip + assistant "who\'s my roommate?" cites F-room + 1 published notification', async () => {
    athlete = trip.traveling_player_ids[0]!;
    athleteHeaders = { 'x-role': 'athlete', 'x-athlete-id': athlete };
    const mine = ok(await get(`/athletes/${athlete}/my-trip`, athleteHeaders), (x) => MyTripResponse.parse(x));
    expect(mine.trip).not.toBeNull();
    expect(mine.trip!.trip_id).toBe('TRIP-G10');
    expect(mine.trip!.bus_number).not.toBeNull();
    expect(mine.trip!.roommates.length).toBeGreaterThan(0);

    const a = ok(await post(`/athletes/${athlete}/assistant`, { message: "Who's my roommate?", history: [] }, athleteHeaders), (x) => AssistantReply.parse(x));
    expect(a.cited_fact_ids).toContain('F-room');
    expect(a.citations.find((c) => c.id === 'F-room')!.text).toContain(mine.trip!.roommates[0]!.name);

    const inbox = ok(await get(`/athletes/${athlete}/notifications`, athleteHeaders), (x) => AthleteNotification.array().parse(x));
    expect(inbox).toHaveLength(1);
    expect(inbox[0]!.title).toBe('Your Ohio trip is published');
  });

  it('7 · staff move the departure → re-publish → athlete inbox shows the time change', async () => {
    const later = { ...trip.request!, departure_constraint: { kind: 'not_before' as const, datetime_local: '2026-11-27T15:00', raw_text: "can't leave before 3 PM Friday" } };
    const edited = ok(await post('/trips/G10/request', later), (x) => TripDetail.parse(x)).trip;
    if (edited.status !== 'published' && edited.status !== 'approved') ok(await post('/trips/TRIP-G10/approve'), (x) => x);
    trip = ok(await post('/trips/TRIP-G10/publish'), (x) => TripDetail.parse(x)).trip;
    expect(trip.published_version).toBe(2);
    const inbox = ok(await get(`/athletes/${athlete}/notifications`, athleteHeaders), (x) => AthleteNotification.array().parse(x));
    const latest = inbox.find((n) => n.version === 2)!;
    expect(latest.changes.some((c) => c.kind === 'time' && c.label === 'Buses depart')).toBe(true);
    expect(latest.body).toMatch(/^Buses now depart Fri Nov 27 at 3:00 PM \(was 2:00 PM\)\./);
  });

  it('8 · packets + share link', async () => {
    const staff = ok(await get('/trips/TRIP-G10/packet?audience=staff'), (x) => Packet.parse(x));
    expect(staff.html).toContain('Estimate');
    expect(staff.share_url).toMatch(/\/share\/TRIP-G10\//);
    const mine = ok(await get(`/trips/TRIP-G10/packet?audience=athlete&athleteId=${athlete}`, athleteHeaders), (x) => Packet.parse(x));
    expect(mine.html).not.toContain('$');
    const path = new URL(staff.share_url).pathname;
    expect((await fetch(`${srv.url}${path}`)).status).toBe(200);
    expect((await fetch(`${srv.url}${path}x`)).status).toBe(404);
  });

  it('9 · AI accuracy screen has a report', async () => {
    const r = await get('/ai/accuracy');
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ cases_run: expect.any(Number), overall_accuracy: expect.any(Number) });
  });

  it('10 · savings bring the season back under budget', async () => {
    const before = ok(await get('/season'), (x) => SeasonRollup.parse(x));
    expect(before.over_budget).toBe(true);
    const s = ok(await post('/season/savings', {}), (x) => SavingsResult.parse(x));
    expect(s.selected_candidate_ids.length).toBeGreaterThan(0);
    expect(s.back_under_budget).toBe(true);
    const after = ok(await post('/season/savings/apply', { candidate_ids: s.selected_candidate_ids }), (x) => SeasonRollup.parse(x));
    expect(after.over_budget).toBe(false);
    expect(ok(await get('/season'), (x) => SeasonRollup.parse(x)).over_budget).toBe(false);
  });

  it('AI usage shows every AI feature was exercised; whole run < 10 s', async () => {
    const u = ok(await get('/ai/usage'), (x) => AiUsageSummary.parse(x));
    expect(u.mock_mode).toBe(true);
    for (const f of ['parse', 'recommend', 'whatif', 'memo', 'assistant', 'savings'] as const) {
      expect(u.by_feature.find((x) => x.feature === f)?.calls ?? 0, f).toBeGreaterThan(0);
    }
    expect(Date.now() - started).toBeLessThan(10_000);
  });
});

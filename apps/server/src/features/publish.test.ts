/** A-13: publish v1 → "published" notifications; change the request → publish v2 → only that athlete-visible change. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AthleteNotification, MyTripResponse, TripDetail } from '@falcon/shared';
import { call, startTestServer } from '../test/server';
import { repo } from '../repo';
import { pack } from '../data';

let srv: Awaited<ReturnType<typeof startTestServer>>;
const post = (p: string, b?: unknown) => call(srv.url, 'POST', p, b);
const get = (p: string, h?: Record<string, string>) => call(srv.url, 'GET', p, undefined, h);
const TRIP = 'TRIP-G12';
const inbox = async (id: string) => AthleteNotification.array().parse((await get(`/athletes/${id}/notifications`, { 'x-role': 'athlete', 'x-athlete-id': id })).json);

beforeAll(async () => {
  srv = await startTestServer();
});
afterAll(async () => {
  await srv?.close();
});

describe('publish → versions → notifications', () => {
  it('unapproved draft cannot be published', async () => {
    expect((await post(`/trips/${TRIP}/publish`)).status).toBe(409);
  });

  it('v1: generates rooming if missing, saves a snapshot, every traveler gets a "published" notification', async () => {
    expect(repo.trips.get(TRIP)!.rooming).toBeNull();
    expect((await post(`/trips/${TRIP}/approve`)).status).toBe(200);
    const r = await post(`/trips/${TRIP}/publish`);
    expect(r.status).toBe(200);
    const { trip } = TripDetail.parse(r.json);
    expect(trip).toMatchObject({ status: 'published', published_version: 1 });
    expect(trip.rooming).not.toBeNull();
    expect(trip.traveling_player_ids).toHaveLength(70);
    expect(repo.versions.get(TRIP, 1)!.published_version).toBe(1);

    const me = trip.traveling_player_ids[0]!;
    const [n] = await inbox(me);
    expect(n).toMatchObject({ id: `N-${TRIP}-v1-${me}`, version: 1, title: 'Your Buffalo trip is published', changes: [], read: false });
    expect(n!.body).toMatch(/^Buses depart Fri Dec 11 at 9:00 AM\. You're on Bus \d\. Room RM-\d+/);
  });

  it('my-trip shows the published slice', async () => {
    const me = repo.trips.get(TRIP)!.traveling_player_ids[0]!;
    const r = MyTripResponse.parse((await get(`/athletes/${me}/my-trip`, { 'x-role': 'athlete', 'x-athlete-id': me })).json);
    expect(r.trip).toMatchObject({ trip_id: TRIP, version: 1, athlete_id: me });
    expect(r.trip!.share_url).toMatch(/\/share\/TRIP-G12\//);
    const benched = pack.roster.find((p) => !repo.trips.get(TRIP)!.traveling_player_ids.includes(p.id))!.id;
    expect(MyTripResponse.parse((await get(`/athletes/${benched}/my-trip`)).json).trip).toBeNull();
  });

  it('v2 after a departure change: notification starts with the departure change; nothing else about bus/room/hotel', async () => {
    const before = repo.trips.get(TRIP)!;
    const req = { ...before.request!, departure_constraint: { kind: 'not_before', datetime_local: '2026-12-11T10:00', raw_text: 'not before 10 AM Friday' } };
    const sub = await post('/trips/G12/request', req);
    expect(sub.status).toBe(200);
    const edited = TripDetail.parse(sub.json).trip;
    expect(edited.status).toBe('published'); // stays published, needs re-publish
    expect(edited.selected_option_id).toBe(before.selected_option_id);
    expect(repo.versions.get(TRIP, 1)!.request!.departure_constraint.kind).toBe(before.request!.departure_constraint.kind); // snapshot untouched

    const pub = TripDetail.parse((await post(`/trips/${TRIP}/publish`)).json).trip;
    expect(pub.published_version).toBe(2);
    const me = pub.traveling_player_ids[0]!;
    const [latest] = await inbox(me);
    expect(latest!.version).toBe(2);
    expect(latest!.changes[0]).toEqual({ kind: 'time', item_id: 'IT-1', label: 'Buses depart', before: 'Fri Dec 11, 9:00 AM', after: 'Fri Dec 11, 10:00 AM' });
    expect(latest!.title).toMatch(/^Buffalo trip updated: departure time changed/);
    expect(latest!.body.startsWith('Buses now depart Fri Dec 11 at 10:00 AM (was 9:00 AM).')).toBe(true);
    expect(latest!.changes.every((c) => ['time', 'added', 'removed'].includes(c.kind))).toBe(true);
  });

  it('re-publishing without changes notifies nobody', async () => {
    const count = (await inbox(repo.trips.get(TRIP)!.traveling_player_ids[0]!)).length;
    TripDetail.parse((await post(`/trips/${TRIP}/publish`)).json);
    expect(await inbox(repo.trips.get(TRIP)!.traveling_player_ids[0]!)).toHaveLength(count);
  });

  it('dropped athletes are told they are off the roster', async () => {
    const t = repo.trips.get(TRIP)!;
    const dropped = t.traveling_player_ids.at(-1)!;
    const sub = await post('/trips/G12/request', { ...t.request!, players: t.request!.players - 1 });
    expect(sub.status).toBe(200);
    TripDetail.parse((await post(`/trips/${TRIP}/publish`)).json);
    const [n] = await inbox(dropped);
    expect(n!.changes).toEqual([{ kind: 'removed', item_id: 'roster', label: 'You are no longer on the travel roster for Buffalo', before: 'On the travel roster', after: '' }]);
    expect(n!.title).toBe('Buffalo trip updated: you are no longer on the travel roster');
    expect(MyTripResponse.parse((await get(`/athletes/${dropped}/my-trip`)).json).trip).toBeNull();
  });

  it('athletes only see their own notifications', async () => {
    const [a, b] = repo.trips.get(TRIP)!.traveling_player_ids;
    expect((await get(`/athletes/${a}/notifications`, { 'x-role': 'athlete', 'x-athlete-id': b! })).status).toBe(403);
    for (const n of await inbox(a!)) expect(n.athlete_id).toBe(a);
  });
});

/** A-10: rooming generate / PUT validation, bus manifest on the trip, roommate deadline on submit. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiErrorBody, Rooming, TripDetail, selectTravelingPlayers, type TripRequest } from '@falcon/shared';
import { call, startTestServer } from '../test/server';
import { repo } from '../repo';
import { pack } from '../data';

let srv: Awaited<ReturnType<typeof startTestServer>>;
const post = (p: string, b?: unknown) => call(srv.url, 'POST', p, b);
const put = (p: string, b: unknown) => call(srv.url, 'PUT', p, b);

beforeAll(async () => {
  srv = await startTestServer();
});
afterAll(async () => {
  await srv?.close();
});

describe('POST /trips/:id/rooming/generate', () => {
  it('builds real rooms from roommate requests and saves roster + buses', async () => {
    const t = repo.trips.get('TRIP-G12')!;
    expect(t.selected_option_id).toBeTruthy();
    // two players who will travel, far apart in the default grouping (so only the request puts them together)
    const travelers = selectTravelingPlayers(pack.roster, t.request!.players);
    const ids = [travelers[0]!.id, travelers.at(-1)!.id];
    repo.roommateRequests.save({ athlete_id: ids[0]!, trip_id: 'TRIP-G12', requested_ids: [ids[1]!], updated_at: 'x' });
    repo.roommateRequests.save({ athlete_id: ids[1]!, trip_id: 'TRIP-G12', requested_ids: [ids[0]!], updated_at: 'x' });
    const r = await post('/trips/TRIP-G12/rooming/generate');
    expect(r.status).toBe(200);
    expect(r.headers.get('x-fixture')).toBeNull();
    const rooming = Rooming.parse(r.json);
    const saved = repo.trips.get('TRIP-G12')!;
    const pkg = saved.packages.find((p) => p.option_id === saved.selected_option_id)!;
    expect(rooming.rooms.length).toBe(pkg.counts.rooms_total);
    expect(rooming.requests_total).toBeGreaterThanOrEqual(2);
    expect(rooming.rooms.find((x) => x.occupant_ids.includes(ids[0]!))!.occupant_ids.sort()).toEqual([...ids].sort());
    expect(rooming.requests_honored).toBe(2);
    expect(saved.traveling_player_ids).toHaveLength(saved.request!.players);
    expect(saved.traveling_staff_ids).toHaveLength(saved.request!.coaches + saved.request!.support_staff);
    expect(saved.buses).toHaveLength(pkg.counts.buses);
    for (const b of saved.buses) expect(b.traveler_ids.length).toBeLessThanOrEqual(pkg.counts.seats_per_bus);
    expect(saved.buses[0]!.traveler_ids[0]).toBe('S-001'); // head coach on bus 1
  });

  it('409 without a selected package', async () => {
    const t = repo.trips.get('TRIP-G12')!;
    repo.trips.save({ ...t, selected_option_id: null });
    const r = await post('/trips/TRIP-G12/rooming/generate');
    expect(r.status).toBe(409);
    repo.trips.save(t);
  });
});

describe('PUT /trips/:id/rooming', () => {
  it('accepts a valid swap and recomputes honored requests', async () => {
    const rooming = repo.trips.get('TRIP-G12')!.rooming!;
    const rooms = structuredClone(rooming.rooms);
    const [r1, r2] = rooms.filter((x) => x.kind === 'player') as [typeof rooms[0], typeof rooms[0]];
    [r1.occupant_ids[0], r2.occupant_ids[0]] = [r2.occupant_ids[0]!, r1.occupant_ids[0]!];
    const r = await put('/trips/TRIP-G12/rooming', { rooms });
    expect(r.status).toBe(200);
    const out = Rooming.parse(r.json);
    expect(out.edited).toBe(true);
    expect(out.requests_honored).toBeLessThanOrEqual(out.requests_total);
    expect(out.requests_honored).toBeLessThan(rooming.requests_honored); // swap split the requested pair's room (RM-01)
  });

  it('rejects an invalid edit with clear messages in details', async () => {
    const rooms = structuredClone(repo.trips.get('TRIP-G12')!.rooming!.rooms);
    const coachRoom = rooms.find((x) => x.kind === 'coach')!;
    const playerRoom = rooms.find((x) => x.kind === 'player')!;
    const player = playerRoom.occupant_ids.shift()!;
    coachRoom.occupant_ids.push(player);
    const r = await put('/trips/TRIP-G12/rooming', { rooms });
    expect(r.status).toBe(400);
    const err = ApiErrorBody.parse(r.json).error;
    expect(err.message).toMatch(/^Rooming has \d+ problems?: /);
    expect(err.details).toEqual(expect.arrayContaining([
      `${player} is a player and can't be in coach room ${coachRoom.room_id}`,
      `${coachRoom.room_id} has 2 occupants (max 1 for coach rooms)`,
    ]));
  });
});

describe('roommate deadline on submit', () => {
  it('= package A departure date − 3 days, 23:59', async () => {
    const req: TripRequest = {
      game_id: 'G10', players: 70, coaches: 12, support_staff: 12, departure_constraint: { kind: 'none', datetime_local: '', raw_text: '' },
      include_equipment_truck: true, caps: { lodging: null, meals: null, bus: null, total: null }, excluded_hotel_ids: [], preference: 'none', notes: '',
    };
    const r = await post('/trips/G10/request', req);
    expect(r.status).toBe(200);
    const { trip } = TripDetail.parse(r.json);
    expect(trip.packages[0]!.departure_local.slice(0, 10)).toBe('2026-11-27');
    expect(trip.roommate_deadline_local).toBe('2026-11-24T23:59');
  });
});

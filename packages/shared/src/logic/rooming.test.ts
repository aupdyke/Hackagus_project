import { describe, expect, it } from 'vitest';
import { loadDataPack } from '../testing/loadData';
import { Rooming, type Player, type RoommateRequest, type Settings } from '../domain';
import { assignBuses } from './buses';
import { assignPlayerRooms, assignRooms, requestStats, validateRooming } from './rooming';
import { selectTravelingPlayers, selectTravelingStaff } from './travelers';

const pack = loadDataPack();
const settings = pack.settings;
const players = selectTravelingPlayers(pack.roster, 70);
const staff = selectTravelingStaff(pack.staff, 12, 12);
const ids = players.map((p) => p.id);
const NOW = '2026-11-20T12:00:00.000Z';
const req = (athlete_id: string, ...requested_ids: string[]): RoommateRequest => ({ athlete_id, trip_id: 'TRIP-G10', requested_ids, updated_at: NOW });
const roomWith = (rooms: string[][], id: string) => rooms.find((r) => r.includes(id));
const [A, B, C, D, E] = ids as [string, string, string, string, string];
const rooms = (requests: RoommateRequest[], k = 2, ps: Player[] = players) => assignPlayerRooms(ps, requests, k);
const run = (requests: RoommateRequest[], s: Settings = settings, driverRooms = 3) =>
  assignRooms({ tripId: 'TRIP-G10', players, staff, requests, settings: s, driverRooms, now: NOW });

describe('assignPlayerRooms', () => {
  it('mutual pair is honored', () => {
    const r = rooms([req(A, B), req(B, A)]);
    expect(roomWith(r, A)).toEqual(expect.arrayContaining([A, B]));
  });

  it('one-way request is honored when there is space', () => {
    expect(roomWith(rooms([req(C, D)]), C)).toEqual(expect.arrayContaining([C, D]));
    // k = 4: A↔B mutual room has space, C → A joins it
    const r4 = rooms([req(A, B), req(B, A), req(C, A)], 4);
    expect(roomWith(r4, C)).toEqual(expect.arrayContaining([A, B, C]));
  });

  it('k=4: mutual partners of occupants are added while there is space', () => {
    const r = rooms([req(A, B, C), req(B, A), req(C, A)], 4);
    expect(roomWith(r, A)!.slice(0, 3)).toEqual([A, B, C]);
  });

  it('3-way request with k=2 honors as many as possible', () => {
    // A↔B mutual; C wants A (full) then D (free) → C rooms with D
    const reqs = [req(A, B), req(B, A), req(C, A, D)];
    const r = rooms(reqs);
    expect(roomWith(r, A)).toEqual([A, B]);
    expect(roomWith(r, C)).toEqual([C, D]);
    const stats = requestStats(r.map((occupant_ids) => ({ occupant_ids })), reqs, ids);
    expect(stats).toEqual({ requests_total: 4, requests_honored: 3 });
  });

  it('ignores requests from or for non-travelers and self-requests', () => {
    const outsider = pack.roster.find((p) => !ids.includes(p.id))!.id;
    const reqs = [req(A, outsider), req(outsider, B), req(E, E)];
    expect(requestStats(rooms(reqs).map((occupant_ids) => ({ occupant_ids })), reqs, ids)).toEqual({ requests_total: 0, requests_honored: 0 });
  });

  it('everyone else is grouped by position group, then class year, then priority', () => {
    const order = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'ST'];
    const years = ['FR', 'SO', 'JR', 'SR', 'GR'];
    const flat = rooms([]).flat().map((id) => players.find((p) => p.id === id)!);
    const key = (p: Player) => [order.indexOf(p.position_group), years.indexOf(p.class_year), p.travel_priority];
    for (let i = 1; i < flat.length; i++) {
      const [a, b] = [key(flat[i - 1]!), key(flat[i]!)];
      const cmp = a[0]! - b[0]! || a[1]! - b[1]! || a[2]! - b[2]!;
      expect(cmp).toBeLessThanOrEqual(0);
    }
  });
});

describe('assignRooms', () => {
  it('everyone exactly once; room ids sequential; kinds in order; counts match the cost engine', () => {
    const r = run([req(A, B), req(B, A), req(C, D)]);
    Rooming.parse(r);
    expect(validateRooming(r, [...ids, ...staff.map((s) => s.id)], settings)).toEqual([]);
    expect(r.rooms.map((x) => x.room_id)).toEqual(r.rooms.map((_, i) => `RM-${String(i + 1).padStart(2, '0')}`));
    const kinds = r.rooms.map((x) => x.kind);
    expect(kinds).toEqual([...kinds].sort((a, b) => ['player', 'coach', 'support', 'driver'].indexOf(a) - ['player', 'coach', 'support', 'driver'].indexOf(b)));
    const count = (k: string) => r.rooms.filter((x) => x.kind === k).length;
    expect([count('player'), count('coach'), count('support'), count('driver')]).toEqual([35, 12, 6, 3]); // = A-01 counts
    expect(r.rooms.filter((x) => x.kind === 'driver').map((x) => x.occupant_ids)).toEqual([['DRIVER-1'], ['DRIVER-2'], ['DRIVER-3']]);
    expect(r).toMatchObject({ requests_total: 3, requests_honored: 3, edited: false, generated_at: NOW, trip_id: 'TRIP-G10' });
  });

  it('is deterministic', () => {
    const reqs = [req(E, A), req(A, E), req(D, C)];
    expect(run(reqs)).toEqual(run([...reqs].reverse()));
  });

  it('respects other occupancy settings', () => {
    const r = run([], { ...settings, player_room_occupancy: 4 }, 0);
    expect(r.rooms.filter((x) => x.kind === 'player')).toHaveLength(18);
    expect(r.rooms.some((x) => x.kind === 'driver')).toBe(false);
  });
});

describe('validateRooming', () => {
  const travelers = [...ids, ...staff.map((s) => s.id)];
  const good = run([]);
  const clone = () => structuredClone(good.rooms);

  it('catches a duplicate', () => {
    const rooms = clone();
    rooms[1]!.occupant_ids = [rooms[0]!.occupant_ids[0]!];
    const errs = validateRooming({ rooms }, travelers, settings);
    expect(errs).toContain(`${rooms[0]!.occupant_ids[0]} appears in 2 rooms (RM-01, RM-02)`);
    expect(errs.some((e) => / is not in any room$/.test(e))).toBe(true); // the displaced roommate
  });

  it('catches a missing person', () => {
    const rooms = clone();
    const gone = rooms[0]!.occupant_ids.pop()!;
    expect(validateRooming({ rooms }, travelers, settings)).toEqual([`${gone} is not in any room`]);
  });

  it('catches over-occupancy, unknown ids and wrong room kinds', () => {
    const rooms = clone();
    const moved = rooms[1]!.occupant_ids.shift()!;
    rooms[0]!.occupant_ids.push(moved);
    rooms[1]!.occupant_ids.push('P-999');
    const coachRoom = rooms.find((r) => r.kind === 'coach')!;
    const player = rooms[2]!.occupant_ids.shift()!;
    coachRoom.occupant_ids = [...coachRoom.occupant_ids, player];
    const errs = validateRooming({ rooms }, travelers, settings);
    expect(errs).toEqual(expect.arrayContaining([
      'RM-01 has 3 occupants (max 2 for player rooms)',
      'P-999 in RM-02 is not traveling on this trip',
      `${player} is a player and can't be in coach room ${coachRoom.room_id}`,
      `${coachRoom.room_id} has 2 occupants (max 1 for coach rooms)`,
    ]));
  });

  it('staff in a player room; duplicate room ids', () => {
    const rooms = clone();
    rooms[0]!.occupant_ids.push(staff[0]!.id);
    rooms[1]!.room_id = 'RM-01';
    const errs = validateRooming({ rooms }, travelers, settings, { [staff[0]!.id]: 'coach' });
    expect(errs).toEqual(expect.arrayContaining(['Room id RM-01 is used twice', `${staff[0]!.id} is a coach and can't be in player room RM-01`]));
  });
});

describe('assignBuses', () => {
  const coaches = staff.filter((s) => s.category === 'coach');

  it('never exceeds seats; everyone once; head coach on bus 1; coaches alternate', () => {
    const buses = assignBuses(players, staff, 2, 56);
    expect(buses.map((b) => b.bus_number)).toEqual([1, 2]);
    for (const b of buses) expect(b.traveler_ids.length).toBeLessThanOrEqual(56);
    const all = buses.flatMap((b) => b.traveler_ids);
    expect(all.sort()).toEqual([...ids, ...staff.map((s) => s.id)].sort());
    expect(buses[0]!.traveler_ids[0]).toBe(coaches[0]!.id);
    expect(coaches[0]!.role).toBe('Head Coach');
    const coachBus = coaches.map((c) => buses.findIndex((b) => b.traveler_ids.includes(c.id)));
    expect(coachBus.filter((i) => i === 0).length).toBe(6);
  });

  it('offense starts on bus 1, defense on the last bus', () => {
    const buses = assignBuses(players, staff, 2, 56);
    const groupOf = (id: string) => players.find((p) => p.id === id)?.position_group;
    expect(buses[0]!.traveler_ids.filter((id) => groupOf(id) === 'QB').length).toBe(players.filter((p) => p.position_group === 'QB').length);
    expect(buses[1]!.traveler_ids.filter((id) => groupOf(id) === 'DB').length).toBe(players.filter((p) => p.position_group === 'DB').length);
  });

  it('tight fit and too many people', () => {
    const tight = assignBuses(players, staff, 1, 94);
    expect(tight[0]!.traveler_ids).toHaveLength(94);
    expect(() => assignBuses(players, staff, 1, 93)).toThrow(/No seat left/);
  });

  it('is deterministic', () => {
    expect(assignBuses(players, staff, 3, 40)).toEqual(assignBuses([...players].reverse(), staff, 3, 40));
  });
});

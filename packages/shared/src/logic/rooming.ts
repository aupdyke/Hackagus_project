/**
 * Rooming — task A-10. Order: (1) mutual requests, (2) one-way requests, (3) the rest grouped by
 * position_group then class_year (then travel_priority). Player rooms hold settings.player_room_occupancy. Coach/support
 * rooms by their occupancy; driver rooms (`kind: driver`, occupants `DRIVER-1`..) when overnight.
 * Room ids RM-01.. in the order players, coaches, support, drivers.
 * requests_total = (requester, requested) pairs among travelers; requests_honored = those pairs sharing a room.
 * Deterministic: every loop runs in id order.
 */
import { ClassYear, PositionGroup, type Player, type Room, type Rooming, type RoommateRequest, type Settings, type StaffMember } from '../domain';

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const GROUP_ORDER = PositionGroup.options;
const YEAR_ORDER = ClassYear.options;
export const isDriverId = (id: string) => /^DRIVER-\d+$/.test(id);
export const driverId = (n: number) => `DRIVER-${n}`;

/** requester → requested ids, keeping only traveling players other than themselves (max 2, in the athlete's order). */
export function travelingRequests(requests: RoommateRequest[], playerIds: Set<string>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const r of [...requests].sort((a, b) => byId(a.athlete_id, b.athlete_id))) {
    if (!playerIds.has(r.athlete_id)) continue;
    const wanted = [...new Set(r.requested_ids)].filter((id) => id !== r.athlete_id && playerIds.has(id)).slice(0, 2);
    if (wanted.length) out.set(r.athlete_id, wanted);
  }
  return out;
}

/** Pair counts for the "N of M requests honored" line (recomputed after staff edits too). */
export function requestStats(rooms: Pick<Room, 'occupant_ids'>[], requests: RoommateRequest[], playerIds: string[]): { requests_honored: number; requests_total: number } {
  const roomOf = new Map<string, number>();
  rooms.forEach((r, i) => r.occupant_ids.forEach((id) => roomOf.set(id, i)));
  let total = 0;
  let honored = 0;
  for (const [a, wanted] of travelingRequests(requests, new Set(playerIds))) {
    for (const b of wanted) {
      total++;
      if (roomOf.has(a) && roomOf.get(a) === roomOf.get(b)) honored++;
    }
  }
  return { requests_honored: honored, requests_total: total };
}

function chunk<T>(xs: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

/** Player rooms only (arrays of player ids), per the three-step algorithm. */
export function assignPlayerRooms(players: Player[], requests: RoommateRequest[], k: number): string[][] {
  const ids = new Set(players.map((p) => p.id));
  const wants = travelingRequests(requests, ids);
  const rooms: string[][] = [];
  const roomOf = new Map<string, string[]>();
  const place = (room: string[], id: string) => {
    room.push(id);
    roomOf.set(id, room);
  };
  const open = (...members: string[]) => {
    const room: string[] = [];
    rooms.push(room);
    for (const m of members) place(room, m);
    return room;
  };
  const mutual = (a: string, b: string) => !!wants.get(a)?.includes(b) && !!wants.get(b)?.includes(a);

  // 1. Mutual pairs (then, if rooms hold more than 2, mutual partners of occupants while there is space).
  for (const a of [...wants.keys()].sort(byId)) {
    for (const b of wants.get(a)!) {
      if (roomOf.has(a) || roomOf.has(b) || !mutual(a, b) || k < 2) continue;
      const room = open(a, b);
      let grew = true;
      while (grew && room.length < k) {
        grew = false;
        for (const occ of [...room]) {
          const partner = [...ids].sort(byId).find((x) => !roomOf.has(x) && mutual(occ, x));
          if (partner && room.length < k) {
            place(room, partner);
            grew = true;
          }
        }
      }
    }
  }

  // 2. One-way: join a requested player's room if it has space, else start a room together (first workable request).
  for (const a of [...wants.keys()].sort(byId)) {
    if (roomOf.has(a)) continue;
    for (const b of wants.get(a)!) {
      const r = roomOf.get(b);
      if (r && r.length < k) { place(r, a); break; }
      if (!r && k >= 2) { open(a, b); break; }
    }
  }

  // 3. Everyone else, grouped by position group → class year → priority; partial rooms first, then new rooms.
  const rest = players
    .filter((p) => !roomOf.has(p.id))
    .sort((a, b) =>
      GROUP_ORDER.indexOf(a.position_group) - GROUP_ORDER.indexOf(b.position_group) ||
      YEAR_ORDER.indexOf(a.class_year) - YEAR_ORDER.indexOf(b.class_year) ||
      a.travel_priority - b.travel_priority ||
      byId(a.id, b.id));
  for (const p of rest) {
    const partial = rooms.find((r) => r.length < k);
    if (partial) place(partial, p.id);
    else open(p.id);
  }
  return rooms;
}

export function assignRooms(input: { tripId: string; players: Player[]; staff: StaffMember[]; requests: RoommateRequest[]; settings: Settings; driverRooms: number; now: string }): Rooming {
  const { players, staff, requests, settings, driverRooms } = input;
  const groups: { kind: Room['kind']; ids: string[] }[] = [
    ...assignPlayerRooms(players, requests, settings.player_room_occupancy).map((ids) => ({ kind: 'player' as const, ids })),
    ...chunk(staff.filter((s) => s.category === 'coach').map((s) => s.id).sort(byId), settings.coach_room_occupancy).map((ids) => ({ kind: 'coach' as const, ids })),
    ...chunk(staff.filter((s) => s.category === 'support').map((s) => s.id).sort(byId), settings.support_room_occupancy).map((ids) => ({ kind: 'support' as const, ids })),
    ...Array.from({ length: Math.max(0, driverRooms) }, (_, i) => ({ kind: 'driver' as const, ids: [driverId(i + 1)] })),
  ];
  const width = Math.max(2, String(groups.length).length);
  const rooms: Room[] = groups.map((g, i) => ({ room_id: `RM-${String(i + 1).padStart(width, '0')}`, kind: g.kind, occupant_ids: g.ids }));
  return {
    trip_id: input.tripId,
    generated_at: input.now,
    rooms,
    ...requestStats(rooms, requests, players.map((p) => p.id)),
    edited: false,
  };
}

/** Room kind an occupant must be in. Uses `kinds` when given, else id prefixes (P- player, DRIVER-n driver). */
const expectedKind = (id: string, kinds?: Record<string, Room['kind']>): Room['kind'] | null =>
  kinds?.[id] ?? (isDriverId(id) ? 'driver' : id.startsWith('P-') ? 'player' : null);

/**
 * Validate a staff-edited rooming (everyone exactly once, occupancy respected, people in the right kind of room).
 * Returns human-readable error strings ([] = valid). `kinds` (id → room kind) makes the kind check exact.
 */
export function validateRooming(rooming: Pick<Rooming, 'rooms'>, travelerIds: string[], settings: Settings, kinds?: Record<string, Room['kind']>): string[] {
  const errors: string[] = [];
  const limit: Record<Room['kind'], number> = {
    player: settings.player_room_occupancy, coach: settings.coach_room_occupancy, support: settings.support_room_occupancy, driver: 1,
  };
  const travelers = new Set(travelerIds);
  const seen = new Map<string, string[]>();
  const roomIds = new Set<string>();

  for (const room of rooming.rooms) {
    if (roomIds.has(room.room_id)) errors.push(`Room id ${room.room_id} is used twice`);
    roomIds.add(room.room_id);
    if (room.occupant_ids.length > limit[room.kind]) {
      errors.push(`${room.room_id} has ${room.occupant_ids.length} occupants (max ${limit[room.kind]} for ${room.kind} rooms)`);
    }
    for (const id of room.occupant_ids) {
      seen.set(id, [...(seen.get(id) ?? []), room.room_id]);
      if (!travelers.has(id) && !isDriverId(id)) errors.push(`${id} in ${room.room_id} is not traveling on this trip`);
      const want = expectedKind(id, kinds);
      if (want && want !== room.kind) errors.push(`${id} is a ${want === 'player' ? 'player' : want} and can't be in ${room.kind} room ${room.room_id}`);
      if (!want && room.kind === 'player') errors.push(`${id} is staff and can't be in player room ${room.room_id}`);
    }
  }
  for (const [id, where] of seen) if (where.length > 1) errors.push(`${id} appears in ${where.length} rooms (${where.join(', ')})`);
  for (const id of travelerIds) if (!seen.has(id)) errors.push(`${id} is not in any room`);
  return errors;
}

/**
 * Bus manifest — task A-10. Deterministic:
 *  1. coaches alternate across buses (head coach = first coach → bus 1),
 *  2. offense (QB RB WR TE OL) fills from bus 1 up, defense (DL LB DB) from the last bus down,
 *     specialists (ST) go to the bus with the most free seats,
 *  3. support staff fill the remaining seats (most free seats first).
 * No bus exceeds seats_per_bus; throws if the travelers simply don't fit (caller sizes buses from the same counts).
 */
import { PositionGroup, type BusAssignment, type Player, type StaffMember } from '../domain';

const OFFENSE = new Set(['QB', 'RB', 'WR', 'TE', 'OL']);
const DEFENSE = new Set(['DL', 'LB', 'DB']);
const GROUP_ORDER = PositionGroup.options;

export function assignBuses(players: Player[], staff: StaffMember[], buses: number, seatsPerBus: number): BusAssignment[] {
  const n = Math.max(1, buses);
  const manifest: BusAssignment[] = Array.from({ length: n }, (_, i) => ({ bus_number: i + 1, traveler_ids: [] }));
  const free = (b: BusAssignment) => seatsPerBus - b.traveler_ids.length;
  const seat = (b: BusAssignment | undefined, id: string) => {
    if (!b) throw new Error(`No seat left for ${id}: ${n} bus(es) × ${seatsPerBus} seats`);
    b.traveler_ids.push(id);
  };
  const firstWithSpace = (order: BusAssignment[]) => order.find((b) => free(b) > 0);
  const roomiest = () => manifest.reduce<BusAssignment | undefined>((best, b) => (free(b) > 0 && (!best || free(b) > free(best)) ? b : best), undefined);

  // 1. Coaches alternate (skip a full bus).
  const coaches = staff.filter((s) => s.category === 'coach');
  coaches.forEach((c, i) => {
    const start = i % n;
    seat(firstWithSpace([...manifest.slice(start), ...manifest.slice(0, start)]), c.id);
  });

  // 2. Players by side of the ball.
  const sorted = [...players].sort((a, b) =>
    GROUP_ORDER.indexOf(a.position_group) - GROUP_ORDER.indexOf(b.position_group) || a.travel_priority - b.travel_priority || (a.id < b.id ? -1 : 1));
  for (const p of sorted.filter((x) => OFFENSE.has(x.position_group))) seat(firstWithSpace(manifest), p.id);
  for (const p of sorted.filter((x) => DEFENSE.has(x.position_group))) seat(firstWithSpace([...manifest].reverse()), p.id);
  for (const p of sorted.filter((x) => !OFFENSE.has(x.position_group) && !DEFENSE.has(x.position_group))) seat(roomiest(), p.id);

  // 3. Support staff fill what's left.
  for (const s of staff.filter((x) => x.category === 'support')) seat(roomiest(), s.id);
  return manifest;
}

/**
 * Who travels — task A-01.
 * Players: eligible players sorted by travel_priority ascending, take the first N.
 * Staff: coaches with travels_by_default first (then the rest, by id) take N; same for support.
 */
import type { Player, StaffMember } from '../domain';
import { NotImplementedError } from '../errors';

export function selectTravelingPlayers(_roster: Player[], _n: number): Player[] {
  throw new NotImplementedError('A-01');
}
export function selectTravelingStaff(_staff: StaffMember[], _coaches: number, _support: number): StaffMember[] {
  throw new NotImplementedError('A-01');
}

/**
 * Bus manifest — task A-10. Deterministic: coaches split across buses first (head coach bus 1), then
 * players by position group (offense bus 1, defense bus 2, specialists fill), then support staff.
 * No bus exceeds seats_per_bus.
 */
import type { BusAssignment, Player, StaffMember } from '../domain';
import { NotImplementedError } from '../errors';

export function assignBuses(_players: Player[], _staff: StaffMember[], _buses: number, _seatsPerBus: number): BusAssignment[] {
  throw new NotImplementedError('A-10');
}

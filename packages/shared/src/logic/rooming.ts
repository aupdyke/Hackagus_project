/**
 * Rooming — task A-10. Order: (1) mutual requests, (2) one-way requests, (3) the rest grouped by
 * position_group then class_year. Player rooms hold settings.player_room_occupancy. Coaches/support
 * rooms by their occupancy; driver rooms (`kind: driver`, occupants `DRIVER-1`..) when overnight.
 * Room ids RM-01.. ; requests_honored counts individual requested ids that ended up in the same room.
 */
import type { Player, Rooming, RoommateRequest, Settings, StaffMember } from '../domain';
import { NotImplementedError } from '../errors';

export function assignRooms(_input: { tripId: string; players: Player[]; staff: StaffMember[]; requests: RoommateRequest[]; settings: Settings; driverRooms: number; now: string }): Rooming {
  throw new NotImplementedError('A-10');
}

/** Validate a staff-edited rooming (everyone exactly once, occupancy respected). Returns error strings. */
export function validateRooming(_rooming: Pick<Rooming, 'rooms'>, _travelerIds: string[], _settings: Settings): string[] {
  throw new NotImplementedError('A-10');
}

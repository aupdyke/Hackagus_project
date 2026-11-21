/**
 * Who travels — task A-01.
 * Players: eligible players sorted by travel_priority ascending, take the first N.
 * Staff: coaches with travels_by_default first (then the rest, by id) take N; same for support.
 * Pure: inputs are never mutated; ties are broken by id so output is deterministic.
 */
import type { Player, StaffCategory, StaffMember } from '../domain';

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const take = (n: number) => Math.max(0, Math.floor(n));

export function selectTravelingPlayers(roster: Player[], n: number): Player[] {
  return roster
    .filter((p) => p.travel_eligible)
    .sort((a, b) => a.travel_priority - b.travel_priority || byId(a, b))
    .slice(0, take(n));
}

function pickCategory(staff: StaffMember[], category: StaffCategory, n: number): StaffMember[] {
  return staff
    .filter((s) => s.category === category)
    .sort((a, b) => Number(b.travels_by_default) - Number(a.travels_by_default) || byId(a, b))
    .slice(0, take(n));
}

export function selectTravelingStaff(staff: StaffMember[], coaches: number, support: number): StaffMember[] {
  return [...pickCategory(staff, 'coach', coaches), ...pickCategory(staff, 'support', support)];
}

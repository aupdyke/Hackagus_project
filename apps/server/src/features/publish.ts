/**
 * Publish → versions → per-athlete notifications (task A-13), plus the rooming generator shared with A-10's route.
 * Each publish snapshots the trip as a new version; code diffs every traveling athlete's view against the previous
 * version and writes a notification listing only what changed for them (no AI).
 */
import {
  ROSTER_ITEM_ID, assignBuses, assignRooms, buildAthleteView, describeChanges, diffAthleteViews,
  selectTravelingPlayers, selectTravelingStaff, type AthleteNotification, type AthleteTripView, type Trip,
} from '@falcon/shared';
import { randomBytes } from 'node:crypto';
import { env } from '../env';
import { conflict } from '../http';
import { gameById, hotelById, pack, planning, playerById } from '../data';
import { repo } from '../repo';

export const shareUrl = (tripId: string, token: string) => `${env.PUBLIC_BASE_URL}/share/${tripId}/${token}`;

const selected = (t: Trip) => t.packages.find((p) => p.option_id === t.selected_option_id) ?? null;

/** A-10: rooming + traveling roster + bus manifest for the selected package (returns the updated trip, unsaved). */
export function withRooming(trip: Trip, now = new Date().toISOString()): Trip {
  if (!trip.request) throw conflict('Submit a trip request first');
  const pkg = selected(trip);
  if (!pkg) throw conflict('Select a package before generating rooming');
  const players = selectTravelingPlayers(pack.roster, trip.request.players);
  const staff = selectTravelingStaff(pack.staff, trip.request.coaches, trip.request.support_staff);
  const rooming = assignRooms({
    tripId: trip.trip_id, players, staff, requests: repo.roommateRequests.listForTrip(trip.trip_id),
    settings: repo.settings.get(), driverRooms: pkg.counts.rooms_drivers, now,
  });
  const buses = assignBuses(players, staff, pkg.counts.buses, pkg.counts.seats_per_bus);
  return { ...trip, rooming, buses, traveling_player_ids: players.map((p) => p.id), traveling_staff_ids: staff.map((s) => s.id) };
}

/** Rooming must be (re)built when missing, or when the request/package changed who travels or how many buses. */
export function roomingIsStale(trip: Trip): boolean {
  const pkg = selected(trip);
  if (!trip.rooming || !trip.request || !pkg) return true;
  const want = selectTravelingPlayers(pack.roster, trip.request.players).map((p) => p.id);
  const wantStaff = selectTravelingStaff(pack.staff, trip.request.coaches, trip.request.support_staff).map((s) => s.id);
  const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
  return !same(want, trip.traveling_player_ids) || !same(wantStaff, trip.traveling_staff_ids) || trip.buses.length !== pkg.counts.buses;
}

/** The athlete's view of one (published) trip snapshot, or null if they aren't traveling on it. */
export function athleteViewOf(trip: Trip, athleteId: string): AthleteTripView | null {
  const athlete = playerById(athleteId);
  const game = gameById(trip.game_id);
  const pkg = selected(trip);
  if (!athlete || !game || !pkg || !trip.traveling_player_ids.includes(athleteId)) return null;
  return buildAthleteView(trip, game, hotelById(pkg.hotel_id) ?? null, athlete, planning, repo.settings.get(), trip.share_token ? shareUrl(trip.trip_id, trip.share_token) : '');
}

export function publishTrip(trip: Trip, now = new Date().toISOString()): { trip: Trip; notifications: AthleteNotification[] } {
  if (trip.status !== 'approved' && trip.status !== 'published') throw conflict('Approve the trip before publishing');
  if (!selected(trip)) throw conflict('Select a package before publishing');
  const game = gameById(trip.game_id)!;

  const base = roomingIsStale(trip) ? withRooming(trip, now) : trip;
  const prev = trip.published_version > 0 ? repo.versions.get(trip.trip_id, trip.published_version) : null;
  const next: Trip = {
    ...base,
    status: 'published',
    published_version: trip.published_version + 1,
    published_at: now,
    share_token: trip.share_token || randomBytes(18).toString('base64url'),
    updated_at: now,
  };
  repo.versions.save(next);
  const saved = repo.trips.save(next);

  const notifications: AthleteNotification[] = [];
  const notify = (athleteId: string, title: string, body: string, changes: AthleteNotification['changes']) =>
    notifications.push({
      id: `N-${saved.trip_id}-v${saved.published_version}-${athleteId}`, athlete_id: athleteId, trip_id: saved.trip_id,
      version: saved.published_version, created_at: now, title, body, changes, read: false,
    });

  for (const id of saved.traveling_player_ids) {
    const after = athleteViewOf(saved, id);
    if (!after) continue;
    const before = prev ? athleteViewOf(prev, id) : null;
    const changes = diffAthleteViews(before, after);
    if (before && !changes.length) continue; // nothing changed for this athlete
    const { title, body } = describeChanges(changes, game.opponent, after);
    notify(id, title, body, changes);
  }
  for (const id of prev?.traveling_player_ids ?? []) {
    if (saved.traveling_player_ids.includes(id)) continue;
    const label = `You are no longer on the travel roster for ${game.opponent}`;
    const changes = [{ kind: 'removed' as const, item_id: ROSTER_ITEM_ID, label, before: 'On the travel roster', after: '' }];
    const { title, body } = describeChanges(changes, game.opponent);
    notify(id, title, `${body} Talk to your position coach with any questions.`, changes);
  }
  for (const n of notifications) repo.notifications.save(n);
  return { trip: saved, notifications };
}

/**
 * The published trip an athlete should see: earliest upcoming published trip they travel on (game date ≥ today),
 * else the most recent one. Uses the published SNAPSHOT (later staff edits stay invisible until re-published).
 */
export function myPublishedView(athleteId: string, today = new Date().toISOString().slice(0, 10)): AthleteTripView | null {
  const snapshots = repo.trips.list()
    .filter((t) => (t.status === 'published' || t.status === 'completed') && t.published_version > 0)
    .map((t) => repo.versions.get(t.trip_id, t.published_version) ?? t)
    .filter((t) => t.traveling_player_ids.includes(athleteId))
    .map((t) => ({ t, date: gameById(t.game_id)?.date ?? '' }));
  const upcoming = snapshots.filter((x) => x.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = snapshots.filter((x) => x.date < today).sort((a, b) => b.date.localeCompare(a.date));
  const pick = upcoming[0] ?? past[0];
  return pick ? athleteViewOf(pick.t, athleteId) : null;
}

/**
 * Typed persistence over db.ts. All reads are Zod-validated so a stale/corrupt doc fails loudly.
 * Seeding: on first start (or POST /dev/reset) settings, trips and actuals are loaded from data/*.json.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import {
  ActualsEntry, AthleteNotification, RoommateRequest, Settings, Trip, TripRequest, dataFile, type TripStatus,
} from '@falcon/shared';
import { db } from './db';
import { REPO_ROOT } from './env';
import { gameById, pack } from './data';

const nowIso = () => new Date().toISOString();

export const repo = {
  settings: {
    get: (): Settings => Settings.parse(db.get('settings', 'current') ?? pack.settings),
    save: (s: Settings) => db.put('settings', 'current', Settings.parse(s)),
  },
  trips: {
    get: (id: string): Trip | null => {
      const t = db.get('trips', id);
      return t ? Trip.parse(t) : null;
    },
    list: (): Trip[] => db.list('trips').map((t) => Trip.parse(t)),
    save: (t: Trip): Trip => {
      const v = Trip.parse({ ...t, updated_at: nowIso() });
      db.put('trips', v.trip_id, v);
      return v;
    },
  },
  /** Snapshot of the whole trip at each publish (used for per-athlete diffs). id = `${tripId}#${version}` */
  versions: {
    get: (tripId: string, version: number): Trip | null => {
      const t = db.get('trip_versions', `${tripId}#${String(version).padStart(3, '0')}`);
      return t ? Trip.parse(t) : null;
    },
    save: (t: Trip) => db.put('trip_versions', `${t.trip_id}#${String(t.published_version).padStart(3, '0')}`, Trip.parse(t)),
  },
  roommateRequests: {
    get: (tripId: string, athleteId: string): RoommateRequest | null => {
      const r = db.get('roommate_requests', `${tripId}#${athleteId}`);
      return r ? RoommateRequest.parse(r) : null;
    },
    listForTrip: (tripId: string): RoommateRequest[] =>
      db.list('roommate_requests').map((r) => RoommateRequest.parse(r)).filter((r) => r.trip_id === tripId),
    save: (r: RoommateRequest) => db.put('roommate_requests', `${r.trip_id}#${r.athlete_id}`, RoommateRequest.parse(r)),
  },
  notifications: {
    listFor: (athleteId: string): AthleteNotification[] =>
      db.list('notifications').map((n) => AthleteNotification.parse(n)).filter((n) => n.athlete_id === athleteId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    save: (n: AthleteNotification) => db.put('notifications', n.id, AthleteNotification.parse(n)),
    markRead: (athleteId: string, ids: string[]) => {
      for (const n of repo.notifications.listFor(athleteId)) if (ids.includes(n.id)) repo.notifications.save({ ...n, read: true });
    },
  },
  actuals: {
    get: (tripId: string): ActualsEntry | null => {
      const a = db.get('actuals', tripId);
      return a ? ActualsEntry.parse(a) : null;
    },
    list: (): ActualsEntry[] => db.list('actuals').map((a) => ActualsEntry.parse(a)),
    save: (a: ActualsEntry) => db.put('actuals', a.trip_id, ActualsEntry.parse(a)),
  },
};

export function emptyTrip(gameId: string, status: TripStatus = 'not_started'): Trip {
  return {
    trip_id: `TRIP-${gameId}`, game_id: gameId, status, request: null, packages: [], selected_option_id: null,
    recommendation: null, whatif_history: [], memo: null, traveling_player_ids: [], traveling_staff_ids: [],
    rooming: null, buses: [], roommate_deadline_local: '', published_version: 0, published_at: '', share_token: '',
    updated_at: nowIso(),
  };
}

const TripSeed = z.object({
  trip_id: z.string(), game_id: z.string(), status: Trip.shape.status, request: TripRequest.nullable(),
  selected_tier: z.enum(['A', 'B', 'C']).nullable(),
});
export type TripSeed = z.infer<typeof TripSeed>;
export function loadTripSeeds(): TripSeed[] {
  return dataFile(z.array(TripSeed)).parse(JSON.parse(readFileSync(join(REPO_ROOT, 'data/trips_seed.json'), 'utf8'))).data;
}

/**
 * Seed the DB if empty. `computePackages` is injected (features/planner.ts) to avoid an import cycle.
 */
export function seedIfEmpty(computePackages: (t: Trip) => Trip, force = false): boolean {
  if (!force && db.get('meta', 'seeded')) return false;
  if (force) db.reset();
  repo.settings.save(pack.settings);
  for (const a of pack.actuals) repo.actuals.save(a);
  const seeds = loadTripSeeds();
  for (const g of pack.schedule.filter((g) => g.home_away === 'away')) {
    const s = seeds.find((x) => x.game_id === g.game_id);
    let trip = emptyTrip(g.game_id, s?.status ?? 'not_started');
    if (s?.request) {
      trip.request = s.request;
      trip = computePackages(trip);
      if (s.selected_tier) {
        const id = `PKG-${g.game_id}-${s.selected_tier}`;
        trip.selected_option_id = trip.packages.some((p) => p.option_id === id) ? id : null;
      }
    }
    if (!gameById(trip.game_id)) throw new Error(`seed references unknown game ${trip.game_id}`);
    repo.trips.save(trip);
  }
  db.put('meta', 'seeded', { at: nowIso() });
  console.log(`[seed] seeded ${seeds.length} trips, ${pack.actuals.length} actuals (${db.kind})`);
  return true;
}

/**
 * Student-athlete side. Every route is scoped to :id (selfOnly middleware) — an athlete only ever gets
 * their own slice. NOT authentication (see README): the role switch is a demo picker.
 */
import { Router } from 'express';
import { selectTravelingPlayers, NotImplementedError, type Trip } from '@falcon/shared';
import { badRequest, conflict, notFound, selfOnly } from '../http';
import { myPublishedView } from '../features/publish';
import { askAssistant } from '../features/assistant';
import { pack, playerById, playerName } from '../data';
import { repo } from '../repo';
import { on } from './_define';
import { requireGame, requireTrip } from './helpers';

export const athletesRouter = Router();
athletesRouter.use('/athletes/:id', selfOnly);

const requireAthlete = (id: string) => {
  const p = playerById(id);
  if (!p) throw notFound(`athlete ${id}`);
  return p;
};

/** Players on a trip's travel roster: stored ids once published, else the projected squad for the request. */
export function travelRosterIds(trip: Trip): string[] {
  if (trip.traveling_player_ids.length) return trip.traveling_player_ids;
  const n = trip.request?.players ?? pack.roster.filter((p) => p.default_travel).length;
  try {
    return selectTravelingPlayers(pack.roster, n).map((p) => p.id);
  } catch (e) {
    if (!(e instanceof NotImplementedError)) throw e;
    return pack.roster.filter((p) => p.default_travel).map((p) => p.id); // until A-01
  }
}

on(athletesRouter, 'listAthletes', () =>
  pack.roster.map(({ id, first_name, last_name, jersey, position, position_group, class_year }) => ({ id, first_name, last_name, jersey, position, position_group, class_year })),
);

/** A-13: the athlete's slice of their published trip (from the published snapshot) + open roommate requests. */
on(athletesRouter, 'myTrip', ({ params }) => {
  const p = requireAthlete(params.id!);
  const open = repo.trips.list()
    .filter((t) => (t.status === 'draft' || t.status === 'approved') && t.roommate_deadline_local && travelRosterIds(t).includes(p.id))
    .map((t) => ({ trip_id: t.trip_id, opponent: requireGame(t.game_id).opponent, deadline_local: t.roommate_deadline_local }));
  return {
    athlete: { id: p.id, name: `${p.first_name} ${p.last_name}`, jersey: p.jersey, position: p.position },
    trip: myPublishedView(p.id),
    open_roommate_requests: open,
  };
});

on(athletesRouter, 'travelRoster', ({ params }) => {
  requireAthlete(params.id!);
  const trip = requireTrip(params.tripId!);
  const ids = travelRosterIds(trip);
  if (!ids.includes(params.id!)) throw conflict('You are not on the travel roster for this trip');
  return ids.filter((x) => x !== params.id).map((x) => {
    const pl = playerById(x)!;
    return { id: x, name: playerName(x), position_group: pl.position_group, class_year: pl.class_year };
  });
});

on(athletesRouter, 'getRoommateRequest', ({ params }) => repo.roommateRequests.get(params.tripId!, params.id!));

on(athletesRouter, 'roommateRequest', ({ params, body }) => {
  requireAthlete(params.id!);
  const trip = requireTrip(body.trip_id);
  const roster = travelRosterIds(trip);
  if (!roster.includes(params.id!)) throw conflict('You are not on the travel roster for this trip');
  if (trip.status === 'published' || trip.status === 'completed') throw conflict('Rooming is final for this trip');
  // deadline compared as local strings (YYYY-MM-DDTHH:MM sorts chronologically).
  const nowLocal = new Date().toISOString().slice(0, 16);
  if (trip.roommate_deadline_local && nowLocal > trip.roommate_deadline_local) throw conflict('The roommate request deadline has passed');
  const ids = [...new Set(body.requested_ids)];
  if (ids.includes(params.id!)) throw badRequest('You cannot request yourself');
  const bad = ids.filter((x) => !roster.includes(x));
  if (bad.length) throw badRequest(`Not on this trip's travel roster: ${bad.join(', ')}`);
  const r = { athlete_id: params.id!, trip_id: trip.trip_id, requested_ids: ids, updated_at: new Date().toISOString() };
  repo.roommateRequests.save(r);
  return r;
});

/** A-14: cited, fact-guarded trip assistant over this athlete's own fact sheet (history trimmed to 6 turns). */
on(athletesRouter, 'assistant', async ({ params, body }) => {
  requireAthlete(params.id!);
  return askAssistant(params.id!, body.message, body.history);
});

on(athletesRouter, 'notifications', ({ params }) => {
  requireAthlete(params.id!);
  return repo.notifications.listFor(params.id!);
});

on(athletesRouter, 'markNotificationsRead', ({ params, body }) => {
  requireAthlete(params.id!);
  repo.notifications.markRead(params.id!, body.ids);
  return { ok: true as const };
});

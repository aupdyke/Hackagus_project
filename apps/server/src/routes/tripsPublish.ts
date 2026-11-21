/** Rooming (A-10), publish + versions + notifications (A-13), packets (A-11, own router), actuals (A-12). */
import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { assignBuses, assignRooms, budgetVsActual, fixtures, requestStats, selectTravelingPlayers, selectTravelingStaff, validateRooming, type Room } from '@falcon/shared';
import { env } from '../env';
import { HttpError, badRequest, conflict, notFound, orFixture, roleOf, staffOnly } from '../http';
import { renderPacketHtml } from '../features/packet';
import { travelRosterIds } from './athletes';
import { pack, staffById } from '../data';
import { repo } from '../repo';
import { on } from './_define';
import { requireGame, requireTrip, selectedPackage } from './helpers';

export const tripsPublishRouter = Router();
tripsPublishRouter.use('/trips', staffOnly);

/**
 * A-11: GET /trips/:id/packet lives on its own router, mounted BEFORE the staff-only routers (app.ts), because
 * athletes may fetch their own packet: role athlete → audience must be 'athlete' and athleteId must equal X-Athlete-Id.
 */
export const packetRouter = Router();
on(packetRouter, 'getPacket', ({ params, query, req }) => {
  const { role, athleteId: callerId } = roleOf(req);
  if (role === 'athlete' && (query.audience !== 'athlete' || !query.athleteId || query.athleteId !== callerId)) {
    throw new HttpError(403, 'forbidden', 'Athletes can only open their own athlete packet');
  }
  const trip = requireTrip(params.id!);
  const game = requireGame(trip.game_id);
  const pkg = selectedPackage(trip);
  if (!pkg) throw conflict('Select a package before creating packets');
  if (query.audience === 'athlete') {
    if (!query.athleteId) throw badRequest('athleteId is required for the athlete packet');
    if (!travelRosterIds(trip).includes(query.athleteId)) throw notFound(`athlete ${query.athleteId} on this trip's travel roster`);
  }
  const { title, html } = renderPacketHtml({ trip, game, pkg, audience: query.audience, athleteId: query.athleteId });
  return {
    trip_id: trip.trip_id, audience: query.audience, title, html,
    share_url: trip.share_token && trip.status === 'published' ? shareUrl(trip.trip_id, trip.share_token) : '',
  };
});

export const shareUrl = (tripId: string, token: string) => `${env.PUBLIC_BASE_URL}/share/${tripId}/${token}`;

on(tripsPublishRouter, 'getRooming', ({ params }) => requireTrip(params.id!).rooming);

/** A-10: rooming from roommate requests (code), bus manifest, traveling roster. */
on(tripsPublishRouter, 'generateRooming', ({ params }) => {
  const trip = requireTrip(params.id!);
  if (!trip.request) throw conflict('Submit a trip request first');
  const pkg = selectedPackage(trip);
  if (!pkg) throw conflict('Select a package before generating rooming');
  const players = selectTravelingPlayers(pack.roster, trip.request.players);
  const staff = selectTravelingStaff(pack.staff, trip.request.coaches, trip.request.support_staff);
  const rooming = assignRooms({
    tripId: trip.trip_id, players, staff, requests: repo.roommateRequests.listForTrip(trip.trip_id),
    settings: repo.settings.get(), driverRooms: pkg.counts.rooms_drivers, now: new Date().toISOString(),
  });
  const buses = assignBuses(players, staff, pkg.counts.buses, pkg.counts.seats_per_bus);
  repo.trips.save({
    ...trip, rooming, buses,
    traveling_player_ids: players.map((p) => p.id),
    traveling_staff_ids: staff.map((s) => s.id),
  });
  return rooming;
});

/** Staff edits (swaps): validated by code; honored-request count recomputed. */
on(tripsPublishRouter, 'updateRooming', ({ params, body }) => {
  const trip = requireTrip(params.id!);
  if (!trip.rooming) throw conflict('Generate rooming first');
  const travelerIds = [...trip.traveling_player_ids, ...trip.traveling_staff_ids];
  const kinds: Record<string, Room['kind']> = {};
  for (const id of trip.traveling_player_ids) kinds[id] = 'player';
  for (const id of trip.traveling_staff_ids) kinds[id] = staffById(id)?.category === 'support' ? 'support' : 'coach';
  const errors = validateRooming({ rooms: body.rooms }, travelerIds, repo.settings.get(), kinds);
  if (errors.length) throw badRequest(`Rooming has ${errors.length} problem${errors.length === 1 ? '' : 's'}: ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? '…' : ''}`, errors);
  const rooms = body.rooms.filter((r) => r.occupant_ids.length > 0);
  const rooming = {
    ...trip.rooming, rooms, edited: true,
    ...requestStats(rooms, repo.roommateRequests.listForTrip(trip.trip_id), trip.traveling_player_ids),
  };
  repo.trips.save({ ...trip, rooming });
  return rooming;
});

// TODO(A-13): traveling roster + buses, version snapshot diff → per-athlete notifications.
on(tripsPublishRouter, 'publishTrip', ({ params }) => {
  const trip = requireTrip(params.id!);
  if (trip.status !== 'approved' && trip.status !== 'published') throw conflict('Approve the trip before publishing');
  const published = {
    ...trip,
    status: 'published' as const,
    published_version: trip.published_version + 1,
    published_at: new Date().toISOString(),
    share_token: trip.share_token || randomBytes(18).toString('base64url'),
  };
  repo.versions.save(published);
  return { trip: repo.trips.save(published), game: requireGame(trip.game_id) };
});

on(tripsPublishRouter, 'postActuals', ({ params, body, res }) => {
  const trip = requireTrip(params.id!);
  const entry = { ...body, trip_id: trip.trip_id, entered_at: new Date().toISOString() };
  repo.actuals.save(entry);
  return orFixture(res, () => budgetVsActual(trip, entry), () => ({ ...fixtures.FIXTURE_BUDGET_VS_ACTUAL, trip_id: trip.trip_id }));
});
on(tripsPublishRouter, 'budgetVsActual', ({ params, res }) => {
  const trip = requireTrip(params.id!);
  return orFixture(res, () => budgetVsActual(trip, repo.actuals.get(trip.trip_id)), () => ({ ...fixtures.FIXTURE_BUDGET_VS_ACTUAL, trip_id: trip.trip_id }));
});

/** Rooming (A-10), publish + versions + notifications (A-13), packets (A-11), actuals (A-12). */
import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { assignBuses, assignRooms, budgetVsActual, fixtures, requestStats, selectTravelingPlayers, selectTravelingStaff, validateRooming, type Room } from '@falcon/shared';
import { env } from '../env';
import { badRequest, conflict, orFixture, staffOnly } from '../http';
import { pack, staffById } from '../data';
import { repo } from '../repo';
import { on } from './_define';
import { requireGame, requireTrip, selectedPackage } from './helpers';

export const tripsPublishRouter = Router();
tripsPublishRouter.use('/trips', staffOnly);

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

// TODO(A-11): full staff/athlete packet HTML (itinerary, manifest, rooming, meals, contacts, costs for staff).
on(tripsPublishRouter, 'getPacket', ({ params, query, res }) => {
  const trip = requireTrip(params.id!);
  const game = requireGame(trip.game_id);
  res.setHeader('X-Fixture', 'A-11');
  const title = `${query.audience === 'staff' ? 'Staff' : 'Athlete'} travel packet — at ${game.opponent}`;
  return {
    trip_id: trip.trip_id, audience: query.audience, title,
    html: `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:-apple-system,Helvetica,Arial"><h1 style="color:#4F2C1D">${title}</h1><p>Packet rendering arrives in task A-11.</p><p><em>Synthetic data. Costs are estimates.</em></p></body></html>`,
    share_url: trip.share_token ? shareUrl(trip.trip_id, trip.share_token) : '',
  };
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

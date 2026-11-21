/** Core trip workflow (Level 1): list, detail, request (form / parse), packages, select, approve. */
import { Router } from 'express';
import { constraintIssue, eligiblePlayerCount, type Game, type Trip, type TripRequest } from '@falcon/shared';
import { badRequest, conflict, staffOnly } from '../http';
import { emptyTrip, repo } from '../repo';
import { pack } from '../data';
import { computeTripPackages } from '../features/planner';
import { parseTripText } from '../features/parse';
import { on } from './_define';
import { requireGame, requireTrip, toSummary } from './helpers';

export const tripsRouter = Router();
tripsRouter.use('/trips', staffOnly);

/**
 * Checks Zod can't do (they need the data pack): eligible-player count, constraint window, excluded hotel ids.
 * Throws 400 with a human-readable message.
 */
export function validateRequestAgainstData(body: TripRequest, game: Game): void {
  const eligible = eligiblePlayerCount(pack);
  if (body.players > eligible) throw badRequest(`Only ${eligible} players are travel-eligible (requested ${body.players})`);
  const issue = constraintIssue(body.departure_constraint, game);
  if (issue) throw badRequest(issue);

  const cityHotels = new Set(pack.hotels.filter((h) => h.city === game.city).map((h) => h.hotel_id));
  const unknown = body.excluded_hotel_ids.filter((id) => !cityHotels.has(id));
  if (unknown.length) throw badRequest(`Unknown hotel(s) for ${game.city}: ${unknown.join(', ')}`);
}

on(tripsRouter, 'listTrips', () =>
  repo.trips.list().map(toSummary).sort((a, b) => a.date.localeCompare(b.date)),
);

// must be registered before /trips/:id routes that could shadow it
on(tripsRouter, 'parseRequest', ({ body }) => parseTripText(body.text));

on(tripsRouter, 'getTrip', ({ params }) => {
  const trip = requireTrip(params.id!);
  return { trip, game: requireGame(trip.game_id) };
});

/** Human-reviewed request (from the form, or the parse review screen) → draft + packages. */
on(tripsRouter, 'submitRequest', ({ params, body }) => {
  const game = requireGame(params.gameId!);
  if (game.home_away !== 'away') throw badRequest(`${game.opponent} is a home game — no travel plan needed`);
  if (body.game_id !== game.game_id) throw badRequest('game_id in body does not match the URL');
  validateRequestAgainstData(body, game);
  const existing = repo.trips.get(`TRIP-${game.game_id}`) ?? emptyTrip(game.game_id);
  if (existing.status === 'completed') throw conflict('This trip is completed and can no longer be edited');
  let trip: Trip = { ...existing, request: body, recommendation: null };
  if (trip.status === 'not_started') trip.status = 'draft';
  if (trip.status === 'approved') trip.status = 'draft'; // changes need re-approval
  trip = computeTripPackages(trip);
  return { trip: repo.trips.save(trip), game };
});

on(tripsRouter, 'computePackages', ({ params }) => {
  const trip = requireTrip(params.id!);
  if (!trip.request) throw conflict('Submit a trip request first');
  return { trip: repo.trips.save(computeTripPackages(trip)), game: requireGame(trip.game_id) };
});

on(tripsRouter, 'selectPackage', ({ params, body }) => {
  const trip = requireTrip(params.id!);
  const pkg = trip.packages.find((p) => p.option_id === body.option_id);
  if (!pkg) throw badRequest(`Unknown option ${body.option_id}`);
  if (!pkg.feasible) throw conflict(`${pkg.option_id} is infeasible: ${pkg.infeasible_reason}`);
  if (trip.status === 'completed') throw conflict('Trip is completed');
  return { trip: repo.trips.save({ ...trip, selected_option_id: pkg.option_id }), game: requireGame(trip.game_id) };
});

on(tripsRouter, 'approveTrip', ({ params }) => {
  const trip = requireTrip(params.id!);
  if (!trip.selected_option_id) throw conflict('Select a package before approving');
  if (trip.status !== 'draft' && trip.status !== 'approved') throw conflict(`Cannot approve a ${trip.status} trip`);
  return { trip: repo.trips.save({ ...trip, status: 'approved' }), game: requireGame(trip.game_id) };
});

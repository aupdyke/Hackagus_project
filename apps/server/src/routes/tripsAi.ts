/** AI-assisted trip features: recommendation (A-05), what-if chat (A-07), streamed memo (A-08). */
import { Router } from 'express';
import { MemoStreamRequest, routes } from '@falcon/shared';
import { conflict, parse, staffOnly } from '../http';
import { repo } from '../repo';
import { streamMemo } from '../features/memo';
import { recommendTrip } from '../features/recommend';
import { runWhatIf } from '../features/whatif';
import { on } from './_define';
import { requireGame, requireTrip, selectedPackage } from './helpers';

export const tripsAiRouter = Router();
tripsAiRouter.use('/trips', staffOnly);

/** A-05: Aivana structured recommendation + ID check + fact guard; template fallback on AI error. */
on(tripsAiRouter, 'recommend', async ({ params }) => {
  const trip = requireTrip(params.id!);
  if (!trip.packages.length) throw conflict('Compute packages first');
  const rec = await recommendTrip(trip, requireGame(trip.game_id));
  repo.trips.save({ ...trip, recommendation: rec });
  return rec;
});

/** A-07: multi-turn structured patch → validate → apply → recompute → diff. */
on(tripsAiRouter, 'whatIf', async ({ params, body }) => {
  const trip = requireTrip(params.id!);
  if (trip.status === 'completed') throw conflict('This trip is completed and can no longer be changed');
  if (!trip.request) throw conflict('Submit a trip request first');
  return runWhatIf(trip, requireGame(trip.game_id), body.message);
});

/** SSE relay: { type: delta | done | error } events (see shared StreamEvent). */
tripsAiRouter.post(routes.memoStream.path, async (req, res) => {
  const body = parse(MemoStreamRequest, req.body ?? {});
  const trip = requireTrip(req.params.id!);
  const game = requireGame(trip.game_id);
  const pkg = body.option_id ? trip.packages.find((p) => p.option_id === body.option_id) : selectedPackage(trip) ?? trip.packages[0];
  if (!pkg || !trip.request) throw conflict('Compute packages (and ideally select one) before writing a memo');
  const ac = new AbortController();
  res.on('close', () => ac.abort());
  await streamMemo(res, trip, game, pkg, ac.signal);
});

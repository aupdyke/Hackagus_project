/** AI-assisted trip features: recommendation (A-05), what-if chat (A-07), streamed memo (A-08). */
import { Router } from 'express';
import { MemoStreamRequest, routes } from '@falcon/shared';
import { conflict, parse, staffOnly } from '../http';
import { repo } from '../repo';
import { streamMemo } from '../features/memo';
import { recommendTrip } from '../features/recommend';
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

// TODO(A-07): multi-turn structured patch → validate → apply → recompute → diff.
on(tripsAiRouter, 'whatIf', ({ params, body, res }) => {
  const trip = requireTrip(params.id!);
  res.setHeader('X-Fixture', 'A-07');
  return {
    reply: `What-if is not wired yet (task A-07). You said: "${body.message.slice(0, 80)}"`,
    needs_clarification: false, clarifying_question: '', patch_ops: [], rejected_ops: [], applied: false, diff: [],
    trip, source: 'fallback' as const,
  };
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

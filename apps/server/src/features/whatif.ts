/**
 * What-if chat — task A-07 (Level 2, multi-turn + structured output).
 * The model proposes a flattened patch; code converts, validates, applies, recomputes packages and diffs them.
 * The reply is fact-guarded (no unverified numbers); on failure it is replaced by a code summary of the applied ops.
 * Any AiError → 200 with source 'fallback' and the friendly message; the trip is unchanged.
 */
import type { z } from 'zod';
import {
  AiWhatIfOut, FACTS_RULE, FRIENDLY_ERROR, WHATIF_SCHEMA, WhatIfResponse, aiOpsToPatch, applyPatch, describeOp, diffPackages,
  emptyFacts, factGuard, factsFromPackages, mergeFacts, type ChatTurn, type Game, type PatchOp, type Trip, type TripRequest,
} from '@falcon/shared';
import { generateStructured, type ChatMessage } from '../aivana/client';
import { AiError } from '../aivana/errors';
import { planning } from '../data';
import { repo } from '../repo';
import { computeTripPackages } from './planner';

type WhatIfOut = z.input<typeof WhatIfResponse>;

/** Turns sent to the model (CLAUDE.md token discipline) and kept on the trip. */
export const WHATIF_HISTORY_SENT = 8;
export const WHATIF_HISTORY_KEPT = 20;

export const WHATIF_SYSTEM = [
  'You translate a coach\'s what-if request into patch ops for the current football trip in FACTS.',
  'Only use hotel ids listed in FACTS.hotels. For counts prefer adjust_count for "leave N home" / "add N".',
  'Fill unused fields with the sentinels from the schema.',
  'If the request is unclear, set needs_clarification and ask one short question with no ops.',
  'Reply in at most 2 sentences and never state dollar figures — code recomputes all costs.',
  FACTS_RULE,
].join(' ');

export function whatIfFacts(trip: Trip, game: Game, req: TripRequest) {
  return {
    request: {
      players: req.players, coaches: req.coaches, support_staff: req.support_staff,
      constraint: req.departure_constraint.kind === 'none' ? 'none' : `${req.departure_constraint.kind} ${req.departure_constraint.datetime_local}`,
      truck: req.include_equipment_truck, caps: req.caps, excluded: req.excluded_hotel_ids, preference: req.preference,
    },
    game_date: game.date,
    options: trip.packages.map((p) => ({ id: p.option_id, label: p.label, hotel_id: p.hotel_id })),
    hotels: planning.hotels.filter((h) => h.city === game.city).map((h) => ({ hotel_id: h.hotel_id, name: h.name })),
  };
}

const trimHistory = (h: ChatTurn[], n: number) => h.slice(-n);

/** Numbers the reply may mention besides the recomputed packages: old/new counts, deltas, caps. */
function requestFacts(before: TripRequest, after: TripRequest, ops: PatchOp[]) {
  const f = emptyFacts();
  f.quantities.player = [before.players, after.players];
  f.quantities.coach = [before.coaches, after.coaches];
  f.quantities.staff = [before.support_staff, after.support_staff];
  for (const op of ops) {
    if (op.op === 'adjust_count') {
      const unit = op.field === 'players' ? 'player' : op.field === 'coaches' ? 'coach' : 'staff';
      f.quantities[unit]!.push(Math.abs(op.delta));
    }
    if (op.op === 'set_count') f.quantities[op.field === 'players' ? 'player' : op.field === 'coaches' ? 'coach' : 'staff']!.push(op.value);
  }
  f.money = [...Object.values(before.caps), ...Object.values(after.caps)].filter((c): c is number => c !== null);
  return f;
}

export async function runWhatIf(trip: Trip, game: Game, message: string): Promise<WhatIfOut> {
  const req = trip.request!;
  const facts = whatIfFacts(trip, game, req);
  const messages: ChatMessage[] = [
    ...trimHistory(trip.whatif_history, WHATIF_HISTORY_SENT).map((t) => ({ role: t.role, content: t.content })),
    { role: 'user', content: `FACTS: ${JSON.stringify(facts)}\nREQUEST: ${message}` },
  ];

  let ai: AiWhatIfOut;
  try {
    ai = (await generateStructured(WHATIF_SCHEMA, AiWhatIfOut, { feature: 'whatif', system: WHATIF_SYSTEM, messages, max_tokens: 500, temperature: 0 })).data;
  } catch (e) {
    if (!(e instanceof AiError)) throw e;
    return {
      reply: FRIENDLY_ERROR[e.code], needs_clarification: false, clarifying_question: '', patch_ops: [], rejected_ops: [],
      applied: false, diff: [], trip, source: 'fallback',
    };
  }

  const withTurns = (t: Trip, reply: string): Trip => ({
    ...t,
    whatif_history: trimHistory([...t.whatif_history, { role: 'user', content: message }, { role: 'assistant', content: reply }], WHATIF_HISTORY_KEPT),
  });

  // Clarifying question: nothing changes except the conversation.
  if (ai.needs_clarification) {
    let q = ai.clarifying_question.trim() || ai.reply.trim() || 'What would you like to change?';
    if (!factGuard(q, factsFromPackages(trip.packages)).passed) q = 'What would you like to change — counts, caps, the departure limit, hotels or the equipment truck?';
    const saved = repo.trips.save(withTurns(trip, q));
    return { reply: q, needs_clarification: true, clarifying_question: q, patch_ops: [], rejected_ops: [], applied: false, diff: [], trip: saved, source: 'ai' };
  }

  const ctx = { game, data: planning };
  const converted = aiOpsToPatch(ai.patch_ops, ctx);
  const { request: nextReq, rejected: applyRejected } = applyPatch(req, converted.ops, ctx);
  const rejectedOps = new Set(applyRejected.map((r) => r.op));
  const appliedOps = converted.ops.filter((op) => !rejectedOps.has(op));
  const rejected_ops = [...converted.rejected, ...applyRejected];

  if (appliedOps.length === 0) {
    const reply = rejected_ops.length
      ? `I couldn't apply that: ${rejected_ops.map((r) => r.reason).join('; ')}.`
      : 'I did not find a change to make. Try counts, caps, the departure limit, hotels or the equipment truck.';
    const saved = repo.trips.save(withTurns(trip, reply));
    return { reply, needs_clarification: false, clarifying_question: '', patch_ops: [], rejected_ops, applied: false, diff: [], trip: saved, source: 'ai' };
  }

  // Apply → recompute by code → diff. Approved trips go back to draft; published trips stay published (re-publish needed).
  let next: Trip = { ...trip, request: nextReq, recommendation: null };
  if (next.status === 'approved') next.status = 'draft';
  next = computeTripPackages(next);
  const diff = diffPackages(trip.packages, next.packages);

  const allowed = mergeFacts(factsFromPackages(next.packages), requestFacts(req, nextReq, appliedOps));
  let reply = ai.reply.trim();
  if (!reply || !factGuard(reply, allowed).passed) {
    reply = `Applied: ${appliedOps.map(describeOp).join('; ')}. Recomputed all packages.`;
  }
  if (rejected_ops.length) reply += ` Not applied: ${rejected_ops.map((r) => r.reason).join('; ')}.`;

  const saved = repo.trips.save(withTurns(next, reply));
  return { reply, needs_clarification: false, clarifying_question: '', patch_ops: appliedOps, rejected_ops, applied: true, diff, trip: saved, source: 'ai' };
}

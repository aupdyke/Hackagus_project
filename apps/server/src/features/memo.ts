/**
 * Streamed trip memo (Level 2, Aivana streaming). Code builds the itinerary + facts; the model writes prose
 * only from FACTS. We relay deltas to the phone as SSE and run the fact guard after the stream finishes.
 * Facts come from shared `memoFacts` (A-08); sentences with unverifiable figures are reported in `done` and saved.
 */
import type { Response } from 'express';
import { FACTS_RULE, FRIENDLY_ERROR, factGuard, memoFacts, type Game, type TravelPackage, type Trip } from '@falcon/shared';
import { streamText } from '../aivana/client';
import { AiError } from '../aivana/errors';
import { sse } from '../http';
import { repo } from '../repo';

export const MEMO_SYSTEM = `You write a short travel memo in Markdown for football coaches and staff: a 1-line summary, an "Itinerary" list, and "Notes" (max 4 bullets). Under 250 words. Copy times and names exactly from FACTS. Call any total an estimate (e.g. "Estimated total"). ${FACTS_RULE}`;

export async function streamMemo(res: Response, trip: Trip, game: Game, pkg: TravelPackage, signal: AbortSignal) {
  const out = sse(res);
  const { facts, allowed } = memoFacts(game, trip.request!, pkg);
  try {
    const { text, meta } = await streamText(
      { feature: 'memo', system: MEMO_SYSTEM, prompt: `FACTS: ${JSON.stringify(facts)}`, max_tokens: 700, temperature: 0.3, signal },
      (delta) => out.send({ type: 'delta', text: delta }),
    );
    // Same list in the saved memo and the done event, so the app can highlight them either way.
    const unverified = factGuard(text, allowed).bad_sentences;
    const latest = repo.trips.get(trip.trip_id) ?? trip;
    repo.trips.save({ ...latest, memo: { markdown: text, generated_at: new Date().toISOString(), option_id: pkg.option_id, unverified_sentences: unverified } });
    out.send({ type: 'done', finish_reason: meta.finish_reason, unverified_sentences: unverified });
  } catch (e) {
    if (signal.aborted) return out.end();
    const code = e instanceof AiError ? e.code : 'internal';
    const message = e instanceof AiError ? FRIENDLY_ERROR[e.code] : 'Memo failed';
    out.send({ type: 'error', code, message });
  }
  out.end();
}

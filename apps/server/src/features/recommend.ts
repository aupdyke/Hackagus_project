/**
 * AI package recommendation — task A-05 (Level 1, Aivana structured output).
 * The model picks ONE option by id and explains tradeoffs; code checks every id (must exist, pick must be feasible)
 * and fact-guards every sentence. One retry with a correction note; then the prose is replaced by the code template.
 * Any AiError → the code template recommendation (HTTP 200, the app shows "AI unavailable — showing code recommendation").
 */
import {
  AiRecommendOut, FACTS_RULE, factGuard, recommendFacts, recommendSchema, templateRecommendation,
  type AllowedFacts, type Game, type Hotel, type Recommendation, type TravelPackage, type Trip,
} from '@falcon/shared';
import { generateStructured } from '../aivana/client';
import { AiError } from '../aivana/errors';
import { pack } from '../data';

export const RECOMMEND_SYSTEM = [
  'You are a travel coordinator assistant for a college football team.',
  'Recommend exactly one travel package from FACTS by option ID and rank all options.',
  'Weigh cost against game readiness: hotel arrival time, hotel distance to the stadium, team meals, meeting room and risk flags.',
  "Respect request.preference when it is not 'none'. Never recommend an option with feasible=false.",
  'Give up to 3 short pros and cons per option and a 2–4 sentence explanation.',
  FACTS_RULE,
].join(' ');

export interface RecommendCheck {
  ok: boolean;
  /** recommended id exists and is feasible */
  pickOk: boolean;
  issues: string[];
}

/** Pure validation of one AI answer: ids (existence, feasibility, uniqueness) + fact guard on all prose. */
export function checkRecommendation(ai: AiRecommendOut, pkgs: TravelPackage[], allowed: AllowedFacts): RecommendCheck {
  const ids = new Set(pkgs.map((p) => p.option_id));
  const issues: string[] = [];
  const pick = pkgs.find((p) => p.option_id === ai.recommended_option_id);
  const anyFeasible = pkgs.some((p) => p.feasible);
  let pickOk = true;
  if (!pick) {
    pickOk = false;
    issues.push(`${ai.recommended_option_id} is not an option id`);
  } else if (!pick.feasible && anyFeasible) {
    pickOk = false;
    issues.push(`${ai.recommended_option_id} is not feasible and must not be recommended`);
  }
  const bad = ai.ranking.filter((id) => !ids.has(id));
  if (bad.length) issues.push(`ranking has unknown ids: ${bad.join(', ')}`);
  if (new Set(ai.ranking).size !== ai.ranking.length) issues.push('ranking repeats an option id');
  const tIds = ai.tradeoffs.map((t) => t.option_id);
  const badT = tIds.filter((id) => !ids.has(id));
  if (badT.length) issues.push(`tradeoffs have unknown ids: ${badT.join(', ')}`);
  if (new Set(tIds).size !== tIds.length) issues.push('tradeoffs repeat an option id');

  const prose = [ai.explanation, ...ai.tradeoffs.flatMap((t) => [...t.pros, ...t.cons])].join('\n');
  issues.push(...factGuard(prose, allowed).issues);
  return { ok: issues.length === 0, pickOk, issues };
}

/**
 * Pure: turn the (last) AI answer into the Recommendation the app sees.
 *  - passes all checks → AI content, source 'ai', ranking normalised (pick first, every option listed once).
 *  - fails → keep the AI pick if valid (else the template's); explanation + tradeoffs from the code template;
 *    fact_guard { passed:false, replaced:true, issues }.
 */
export function finalizeRecommendation(ai: AiRecommendOut, pkgs: TravelPackage[], allowed: AllowedFacts, now: string, hotels: Hotel[] = []): Recommendation {
  const check = checkRecommendation(ai, pkgs, allowed);
  if (!check.ok) {
    const tpl = templateRecommendation(pkgs, now, { hotels, pick: check.pickOk ? ai.recommended_option_id : undefined });
    return { ...tpl, source: check.pickOk ? 'ai' : 'template', fact_guard: { passed: false, replaced: true, issues: check.issues } };
  }
  const order = [ai.recommended_option_id, ...ai.ranking, ...templateRecommendation(pkgs, now, { hotels }).ranking];
  const ranking = [...new Set(order)];
  return {
    recommended_option_id: ai.recommended_option_id,
    ranking,
    tradeoffs: ai.tradeoffs,
    explanation: ai.explanation,
    source: 'ai',
    fact_guard: { passed: true, replaced: false, issues: [] },
    created_at: now,
  };
}

export async function recommendTrip(trip: Trip, game: Game, now = new Date().toISOString()): Promise<Recommendation> {
  const pkgs = trip.packages;
  const hotels = pack.hotels.filter((h) => pkgs.some((p) => p.hotel_id === h.hotel_id));
  if (!trip.request) return templateRecommendation(pkgs, now, { hotels });
  const { facts, allowed } = recommendFacts(game, trip.request, pkgs, hotels);
  const schema = recommendSchema(pkgs.map((p) => p.option_id));
  const basePrompt = `FACTS: ${JSON.stringify(facts)}`;
  const ask = (prompt: string) =>
    generateStructured(schema, AiRecommendOut, { feature: 'recommend', system: RECOMMEND_SYSTEM, prompt, max_tokens: 600, temperature: 0.2 });

  let first: AiRecommendOut;
  try {
    first = (await ask(basePrompt)).data;
  } catch (e) {
    if (e instanceof AiError) return templateRecommendation(pkgs, now, { hotels });
    throw e;
  }
  const check = checkRecommendation(first, pkgs, allowed);
  if (check.ok) return finalizeRecommendation(first, pkgs, allowed, now, hotels);

  let last = first;
  try {
    const correction = `\nCORRECTION: your previous answer used values not in FACTS (${check.issues.join('; ')}). Use only FACTS.`;
    last = (await ask(basePrompt + correction)).data;
  } catch (e) {
    if (!(e instanceof AiError)) throw e; // retry failed → finalize the first (failing) answer → template prose
  }
  return finalizeRecommendation(last, pkgs, allowed, now, hotels);
}

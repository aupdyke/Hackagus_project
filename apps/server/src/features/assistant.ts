/**
 * Athlete trip assistant — task A-14 (multi-turn, structured, cited, never guesses).
 * Facts are rebuilt from THIS athlete's published view on every request (never the roster). The model may only cite
 * those fact ids; the answer is fact-guarded; anything unverifiable becomes "ask a coach" with needs_staff.
 * AiError → deterministic keyword → fact fallback.
 */
import {
  AiAssistantOut, FACTS_RULE, assistantSchema, buildFactSheet, factGuard, factSheetAllowed,
  type AssistantReply, type AthleteTripView, type ChatTurn, type Fact, type MealKind,
} from '@falcon/shared';
import { generateStructured, type ChatMessage } from '../aivana/client';
import { AiError } from '../aivana/errors';
import { myPublishedView } from './publish';

export const ASSISTANT_HISTORY = 6;
export const NO_TRIP_ANSWER = "You don't have a published trip yet — please ask a coach.";
export const UNVERIFIED_ANSWER = "I couldn't verify that from your trip info — please ask a coach.";
export const AI_DOWN_ANSWER = 'AI is unavailable — check My Trip or ask a coach.';

export const ASSISTANT_SYSTEM = [
  "You answer a student-athlete's questions about their own team trip using only FACTS (JSON list below).",
  'Cite the fact ids you used. If the answer is not in FACTS, say they should ask a coach and set needs_staff true.',
  'Never guess times, places or names. Keep answers short and friendly.',
  FACTS_RULE,
].join(' ');

const OK_GUARD = { passed: true, replaced: false, issues: [] as string[] };

/** Keyword → fact, used when AI is down. Deterministic; `nowLocal` (YYYY-MM-DDTHH:MM) picks the "next" meal. */
export function fallbackAnswer(view: AthleteTripView, facts: Fact[], message: string, nowLocal: string): AssistantReply {
  const q = message.toLowerCase();
  const byId = (id: string) => facts.find((f) => f.id === id);
  const mealFact = (kinds: MealKind[] | null) => {
    const meals = view.meals.filter((m) => !kinds || kinds.includes(m.kind));
    const next = meals.find((m) => m.time_local >= nowLocal) ?? meals[0];
    return next ? byId(`F-meal-${next.meal_id}`) : undefined;
  };
  let hit: Fact | undefined;
  if (/\b(leave|leaving|depart|departure)\b/.test(q)) hit = byId(view.itinerary.find((i) => i.kind === 'depart')?.id ?? '');
  else if (/room/.test(q)) hit = byId('F-room');
  else if (/\bbus\b/.test(q)) hit = byId('F-bus');
  else if (/hotel/.test(q)) hit = byId('F-hotel');
  else if (/dinner/.test(q)) hit = mealFact(['team_dinner']);
  else if (/lunch/.test(q)) hit = mealFact(['en_route_lunch']);
  else if (/breakfast/.test(q)) hit = mealFact(['breakfast', 'pregame_meal']);
  else if (/\b(eat|meal|food)\b/.test(q)) hit = mealFact(null);
  else if (/kickoff|game time/.test(q)) hit = byId('F-opponent');
  if (!hit) return { answer: AI_DOWN_ANSWER, cited_fact_ids: [], citations: [], needs_staff: true, source: 'fallback', fact_guard: OK_GUARD };
  return { answer: hit.text, cited_fact_ids: [hit.id], citations: [hit], needs_staff: false, source: 'fallback', fact_guard: OK_GUARD };
}

export async function askAssistant(athleteId: string, message: string, history: ChatTurn[], now = new Date()): Promise<AssistantReply> {
  const view = myPublishedView(athleteId, now.toISOString().slice(0, 10));
  if (!view) return { answer: NO_TRIP_ANSWER, cited_fact_ids: [], citations: [], needs_staff: true, source: 'fallback', fact_guard: OK_GUARD };

  const facts = buildFactSheet(view);
  const ids = facts.map((f) => f.id);
  const messages: ChatMessage[] = [
    ...history.slice(-ASSISTANT_HISTORY).map((t) => ({ role: t.role, content: t.content })),
    { role: 'user', content: message },
  ];
  let ai: AiAssistantOut;
  try {
    ai = (await generateStructured(assistantSchema(ids), AiAssistantOut, {
      feature: 'assistant', system: `${ASSISTANT_SYSTEM}\nFACTS: ${JSON.stringify(facts)}`, messages, max_tokens: 300, temperature: 0,
    })).data;
  } catch (e) {
    if (!(e instanceof AiError)) throw e;
    return fallbackAnswer(view, facts, message, now.toISOString().slice(0, 16));
  }

  const issues: string[] = [];
  const cited = [...new Set(ai.cited_fact_ids)].filter((id) => {
    if (ids.includes(id)) return true;
    issues.push(`${id} is not a fact id`);
    return false;
  });
  const guard = factGuard(ai.answer, factSheetAllowed(view, facts));
  issues.push(...guard.issues);
  if (!guard.passed || (cited.length === 0 && !ai.needs_staff) || !ai.answer.trim()) {
    if (cited.length === 0 && !ai.needs_staff) issues.push('answer had no citations');
    return { answer: UNVERIFIED_ANSWER, cited_fact_ids: [], citations: [], needs_staff: true, source: 'ai', fact_guard: { passed: false, replaced: true, issues } };
  }
  return {
    answer: ai.answer,
    cited_fact_ids: cited,
    citations: cited.map((id) => facts.find((f) => f.id === id)!),
    needs_staff: ai.needs_staff,
    source: 'ai',
    fact_guard: { passed: issues.length === 0, replaced: false, issues },
  };
}

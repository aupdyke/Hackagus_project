/**
 * AI accuracy scoring (A-17) — pure. Compares a parsed TripRequestDraft with a hand-checked expected parse, field by
 * field, and aggregates an AccuracyReport. Rates are fractions 0–1 rounded to 4 decimals.
 */
import { z } from 'zod';
import type { AccuracyReport, TripRequestDraft } from '@falcon/shared';

export const FIELDS = ['game_id', 'players', 'coaches', 'support_staff', 'departure_kind', 'departure_datetime', 'include_equipment_truck'] as const;
export type Field = (typeof FIELDS)[number];

export const Expected = z.object({
  game_id: z.string().nullable(),
  players: z.number().int().nullable(),
  coaches: z.number().int().nullable(),
  support_staff: z.number().int().nullable(),
  departure_kind: z.enum(['none', 'not_before', 'not_after']),
  departure_datetime: z.string(),
  include_equipment_truck: z.boolean().nullable(),
});
export type Expected = z.infer<typeof Expected>;
export const Case = z.object({ id: z.string(), text: z.string().min(3), expected: Expected, note: z.string().optional() });
export type Case = z.infer<typeof Case>;
export const CaseFile = z.object({ note: z.string(), cases: z.array(Case) });

export interface FieldScore { field: Field; correct: boolean; expected: string; got: string }
export interface CaseScore { case_id: string; fields: FieldScore[]; exact: boolean }

const show = (v: unknown) => (v === null || v === undefined ? 'null' : v === '' ? "''" : String(v));

/** What the draft says for each scored field. */
export function draftValues(d: TripRequestDraft | null): Record<Field, unknown> {
  return {
    game_id: d?.game_id ?? null,
    players: d?.players ?? null,
    coaches: d?.coaches ?? null,
    support_staff: d?.support_staff ?? null,
    departure_kind: d?.departure_constraint.kind ?? 'none',
    departure_datetime: d?.departure_constraint.datetime_local ?? '',
    include_equipment_truck: d?.include_equipment_truck ?? null,
  };
}

/** Field-by-field comparison. A null draft (request failed) scores every field wrong. */
export function scoreCase(id: string, expected: Expected, draft: TripRequestDraft | null): CaseScore {
  const got = draftValues(draft);
  const fields = FIELDS.map((field) => {
    const e = expected[field];
    const g = got[field];
    return { field, correct: draft !== null && e === g, expected: show(e), got: draft === null ? 'request failed' : show(g) };
  });
  return { case_id: id, fields, exact: fields.every((f) => f.correct) };
}

const rate = (num: number, den: number) => (den === 0 ? 0 : Math.round((num / den) * 10000) / 10000);

/** One recommend call: was the id valid+feasible; was it AI prose that passed the guard unreplaced (ai=false → template, not counted for the guard rate). */
export interface RecommendSample { valid_id: boolean; guard_clean: boolean; ai?: boolean }

export function aggregate(scores: CaseScore[], opts: { run_at: string; mock: boolean; recommend: RecommendSample[] }): AccuracyReport {
  const per_field = FIELDS.map((field) => {
    const all = scores.map((s) => s.fields.find((f) => f.field === field)!);
    const correct = all.filter((f) => f.correct).length;
    return { field, correct, total: all.length, accuracy: rate(correct, all.length) };
  });
  const correct = per_field.reduce((s, f) => s + f.correct, 0);
  const total = per_field.reduce((s, f) => s + f.total, 0);
  return {
    run_at: opts.run_at,
    mock: opts.mock,
    cases_run: scores.length,
    per_field,
    overall_accuracy: rate(correct, total),
    exact_match_rate: rate(scores.filter((s) => s.exact).length, scores.length),
    recommendation_valid_id_rate: rate(opts.recommend.filter((r) => r.valid_id).length, opts.recommend.length),
    fact_guard_pass_rate: (() => {
      const ai = opts.recommend.filter((r) => r.ai !== false);
      return rate(ai.filter((r) => r.guard_clean).length, ai.length);
    })(),
    failures: scores.flatMap((s) => s.fields.filter((f) => !f.correct).map((f) => ({ case_id: s.case_id, field: f.field, expected: f.expected, got: f.got }))),
  };
}

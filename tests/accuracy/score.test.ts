import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AccuracyReport, type TripRequestDraft } from '@falcon/shared';
import { loadDataPack } from '../../packages/shared/src/testing/loadData';
import { CaseFile, FIELDS, aggregate, scoreCase } from './score';

const file = CaseFile.parse(JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8')));
const schedule = loadDataPack().schedule;

const draft = (o: Partial<TripRequestDraft> = {}): TripRequestDraft => ({
  game_id: 'G10', opponent_text: 'Ohio', players: 68, coaches: 12, support_staff: 11,
  departure_constraint: { kind: 'not_before', datetime_local: '2026-11-27T14:00', raw_text: '' },
  include_equipment_truck: true, notes: '', ...o,
});
const c01 = file.cases[0]!;

describe('cases.json', () => {
  it('≥ 24 well-formed cases with unique ids and consistent expectations', () => {
    expect(file.cases.length).toBeGreaterThanOrEqual(24);
    expect(new Set(file.cases.map((c) => c.id)).size).toBe(file.cases.length);
    for (const c of file.cases) {
      const e = c.expected;
      if (e.game_id) expect(schedule.find((g) => g.game_id === e.game_id)?.home_away, c.id).toBe('away');
      expect(e.departure_kind === 'none', c.id).toBe(e.departure_datetime === '');
      if (e.departure_datetime) {
        const game = schedule.find((g) => g.game_id === e.game_id)!;
        expect(e.departure_datetime < `${game.date}T${game.kickoff_local}`, c.id).toBe(true);
      }
    }
    // coverage the task asks for
    const notes = file.cases.map((c) => c.note ?? '').join(' ');
    for (const w of ['alias', 'word number', 'home game', 'unknown opponent', 'typo', 'noise', 'bullet list']) expect(notes).toContain(w);
    expect(file.cases.some((c) => c.expected.departure_kind === 'not_after')).toBe(true);
    expect(file.cases.some((c) => c.expected.include_equipment_truck === false)).toBe(true);
  });
});

describe('scoreCase / aggregate', () => {
  it('a perfect draft is an exact match', () => {
    const s = scoreCase('c01', c01.expected, draft());
    expect(s.exact).toBe(true);
    expect(s.fields.map((f) => f.field)).toEqual([...FIELDS]);
  });

  it('wrong fields are reported with expected/got strings', () => {
    const s = scoreCase('c01', c01.expected, draft({ players: 86, departure_constraint: { kind: 'none', datetime_local: '', raw_text: '' } }));
    expect(s.exact).toBe(false);
    expect(s.fields.filter((f) => !f.correct)).toEqual([
      { field: 'players', correct: false, expected: '68', got: '86' },
      { field: 'departure_kind', correct: false, expected: 'not_before', got: 'none' },
      { field: 'departure_datetime', correct: false, expected: '2026-11-27T14:00', got: "''" },
    ]);
  });

  it('null vs a value is wrong; a failed request scores every field wrong', () => {
    const e = { ...c01.expected, support_staff: null };
    expect(scoreCase('x', e, draft()).fields.find((f) => f.field === 'support_staff')).toMatchObject({ correct: false, expected: 'null', got: '11' });
    const failed = scoreCase('x', c01.expected, null);
    expect(failed.fields.every((f) => !f.correct && f.got === 'request failed')).toBe(true);
  });

  it('aggregate → a schema-valid AccuracyReport', () => {
    const scores = [scoreCase('a', c01.expected, draft()), scoreCase('b', c01.expected, draft({ game_id: null, players: 1 }))];
    const r = aggregate(scores, { run_at: '2026-11-20T00:00:00.000Z', mock: true, recommend: [{ valid_id: true, guard_clean: true }, { valid_id: true, guard_clean: false }] });
    AccuracyReport.parse(r);
    expect(r.cases_run).toBe(2);
    expect(r.per_field.find((f) => f.field === 'game_id')).toEqual({ field: 'game_id', correct: 1, total: 2, accuracy: 0.5 });
    expect(r.overall_accuracy).toBe(Math.round((12 / 14) * 10000) / 10000);
    expect(r.exact_match_rate).toBe(0.5);
    expect(r.recommendation_valid_id_rate).toBe(1);
    expect(r.fact_guard_pass_rate).toBe(0.5);
    expect(r.failures).toEqual([
      { case_id: 'b', field: 'game_id', expected: 'G10', got: 'null' },
      { case_id: 'b', field: 'players', expected: '68', got: '1' },
    ]);
    expect(aggregate([], { run_at: 'x', mock: true, recommend: [] })).toMatchObject({ overall_accuracy: 0, recommendation_valid_id_rate: 0 });
  });
});

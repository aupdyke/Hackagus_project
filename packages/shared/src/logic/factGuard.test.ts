import { describe, expect, it } from 'vitest';
import * as fx from '../fixtures';
import { emptyFacts, factGuard, factsFromPackages, mergeFacts, normalizeUnit, type AllowedFacts } from './factGuard';
import { round2 } from './money';

const allowed: AllowedFacts = {
  money: [26349.58, 9812.5, 4412, 28],
  quantities: { miles: [400, 200], hours: [3.6], rooms: [56], buses: [2], travelers: [94], players: [70], nights: [1], percent: [8] },
  times: ['12:00', '14:30', '09:00', '16:00'],
  dates: ['2026-11-27', '2026-11-28'],
  ids: ['PKG-G10-A', 'PKG-G10-B', 'PKG-G10-C', 'H-ATH-1', 'R-ATH-5', 'SAV-1', 'IT-3', 'ML-2', 'F-bus-count'],
};
const check = (text: string, a = allowed) => factGuard(text, a);

describe('factGuard', () => {
  it('passes a paragraph that only uses allowed values', () => {
    const text = [
      'PKG-G10-B is the pick: $26,349.58 total for 94 travelers on two buses, staying at H-ATH-1 for 1 night.',
      'It saves $4,412 versus PKG-G10-C and the round trip is 400 miles (3.6 hours each way).',
      'Buses leave Friday Nov 27 at 2:30 p.m. and kickoff is at noon on 11/28; the 8% contingency is included.',
      'Pre-game meal at R-ATH-5 (ML-2), see IT-3 and SAV-1, fact F-bus-count. Also 56 rooms and 70 players, 4 PM? no — 16:00.',
    ].join('\n');
    const r = check(text);
    expect(r.issues).toEqual([]);
    expect(r).toMatchObject({ passed: true, replaced: false, bad_sentences: [] });
  });

  it('handles empty text and prose without numbers', () => {
    expect(check('')).toMatchObject({ passed: true, issues: [] });
    expect(check('   ')).toMatchObject({ passed: true });
    expect(check('This option keeps the team closer to the stadium and has a meeting room. Great for a big game!', emptyFacts()).passed).toBe(true);
    expect(check('Saturday afternoon is busy; may we leave early? We sat down after the noonish meeting.', { ...emptyFacts(), dates: ['2026-11-28'] }).passed).toBe(true);
  });

  it('ignores bare numbers and years', () => {
    expect(check('In 2026 the team ranked 3 and 17 in two polls.', emptyFacts()).passed).toBe(true);
  });

  it('money: unknown amount fails with an issue and the sentence', () => {
    const r = check('Economy is cheap. It costs $9,999 in total! Nice.');
    expect(r.passed).toBe(false);
    expect(r.issues).toEqual(['$9,999 is not in the facts']);
    expect(r.bad_sentences).toEqual(['It costs $9,999 in total!']);
  });

  it('money: ±$1 tolerance, k forms ±1%', () => {
    expect(check('About $26,350.').passed).toBe(true);
    expect(check('About $26,352.').passed).toBe(false);
    expect(check('Hotel runs $9.8k.').passed).toBe(true); // 9800 vs 9812.5
    expect(check('Hotel runs $12K.').passed).toBe(false);
    expect(check('Meals are $28 per person.').passed).toBe(true);
  });

  it('quantities: unit normalisation and word numbers', () => {
    expect(check('Two buses, 400 mi, 3.6 hrs, 56 rooms.').passed).toBe(true);
    expect(check('Three buses are needed.').issues).toEqual(['Three buses is not in the facts']);
    expect(check('A 3-hour drive.').passed).toBe(false); // 3 ≠ 3.6 (±0.05)
    expect(check('A 3.62 hour drive.').passed).toBe(true);
    expect(check('Plan for 95 travelers.').passed).toBe(false);
    expect(check('A 10% buffer.').passed).toBe(false);
    expect(check('two-night stay').passed).toBe(false);
  });

  it('times: 12h, 24h, noon/midnight', () => {
    expect(check('Depart at 9 AM.').passed).toBe(true);
    expect(check('Depart at 9:15 AM.').passed).toBe(false);
    expect(check('Depart at 13:00.').passed).toBe(false);
    expect(check('Kickoff at noon.').passed).toBe(true);
    expect(check('Curfew at midnight.').passed).toBe(false);
    expect(check('Kickoff at 12 PM.').passed).toBe(true);
    expect(check('Leave at 3:15 AM.').issues).toEqual(['3:15 AM is not in the facts']);
    expect(check('Leave at 3:15 a.m. sharp').issues).toEqual(['3:15 a.m. is not in the facts']);
  });

  it('dates: month names, numeric, ISO; weekday names', () => {
    expect(check('Game on November 28, 2026.').passed).toBe(true);
    expect(check('Game on Nov 29.').passed).toBe(false);
    expect(check('Game on 12/12.').passed).toBe(false);
    expect(check('Game on 2026-11-29.').passed).toBe(false);
    expect(check('Game on November 28, 2025.').passed).toBe(false);
    expect(check('Depart Friday.', { ...emptyFacts(), dates: ['2026-11-27'] }).passed).toBe(true);
    expect(check('Depart Thursday.', { ...emptyFacts(), dates: ['2026-11-27'] }).issues).toEqual(["Thursday doesn't match any trip date"]);
  });

  it('ids: unknown option/hotel ids fail', () => {
    expect(check('Pick PKG-G10-D.').issues).toEqual(['PKG-G10-D is not a known id']);
    expect(check('Try H-ATH-9 instead.').passed).toBe(false);
    expect(check('See SAV-7.').passed).toBe(false);
    expect(check('Pick PKG-G10-A.').passed).toBe(true);
  });

  it('collects multiple bad sentences once each, in order', () => {
    const r = check('Good: $4,412.\nBad: $1 and $2.\nAlso bad: PKG-G10-Z.');
    expect(r.issues).toEqual(['$1 is not in the facts', '$2 is not in the facts', 'PKG-G10-Z is not a known id']);
    expect(r.bad_sentences).toEqual(['Bad: $1 and $2.', 'Also bad: PKG-G10-Z.']);
  });

  it('accepts negative allowed money by magnitude', () => {
    expect(check('Saves $500.', { ...emptyFacts(), money: [-500] }).passed).toBe(true);
  });
});

describe('helpers', () => {
  it('normalizeUnit', () => {
    expect(['miles', 'mi', 'Mile'].map(normalizeUnit)).toEqual(['mile', 'mile', 'mile']);
    expect(['buses', 'bus', 'hrs', 'h', '%', 'coaches'].map(normalizeUnit)).toEqual(['bus', 'bus', 'hour', 'hour', 'percent', 'coach']);
  });

  it('mergeFacts unions and normalises quantity keys', () => {
    const m = mergeFacts(
      { ...emptyFacts(), money: [1, 2], quantities: { miles: [200] }, ids: ['A'] },
      { ...emptyFacts(), money: [2, 3], quantities: { mile: [400], buses: [2] }, ids: ['A', 'B'], times: ['12:00'] },
    );
    expect(m).toEqual({ money: [1, 2, 3], quantities: { mile: [200, 400], bus: [2] }, times: ['12:00'], dates: [], ids: ['A', 'B'] });
  });

  it('factsFromPackages(fixtures) includes totals, A/B difference, 94 travelers and PKG-G10-B', () => {
    const f = factsFromPackages(fx.FIXTURE_PACKAGES);
    const [A, B] = fx.FIXTURE_PACKAGES;
    expect(f.money).toContain(26349.58);
    expect(f.money).toContain(round2(Math.abs(B!.costs.total - A!.costs.total)));
    expect(f.quantities.traveler).toContain(94);
    expect(f.quantities.bus).toContain(2);
    expect(f.quantities.room).toContain(56);
    expect(f.quantities.mile).toEqual(expect.arrayContaining([400, 200]));
    expect(f.ids).toEqual(expect.arrayContaining(['PKG-G10-A', 'PKG-G10-B', 'PKG-G10-C', 'H-ATH-1', 'R-ATH-5']));
    expect(f.dates).toEqual(expect.arrayContaining(['2026-11-27', '2026-11-28']));
    expect(f.times).toEqual(expect.arrayContaining(['11:00', '12:00']));
    const diff = round2(B!.costs.total - A!.costs.total);
    const text = `PKG-G10-A costs $26,349.58 for 94 travelers; PKG-G10-B costs $${diff.toLocaleString('en-US')} more and leaves Friday at 11 AM.`;
    expect(factGuard(text, f).issues).toEqual([]);
  });
});

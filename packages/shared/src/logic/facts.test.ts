import { describe, expect, it } from 'vitest';
import { loadDataPack, planningData } from '../testing/loadData';
import { Recommendation, type TravelPackage, type TripRequest } from '../domain';
import * as fx from '../fixtures';
import { factGuard } from './factGuard';
import { memoFacts, rankPackages, recommendFacts, templateRecommendation } from './facts';
import { buildPackages } from './packages';
import { formatDayTime } from './time';

const pack = loadDataPack();
const data = planningData(pack);
const NOW = '2026-11-20T12:00:00.000Z';
const REQ: TripRequest = { ...fx.FIXTURE_REQUEST, departure_constraint: { kind: 'none', datetime_local: '', raw_text: '' }, caps: { lodging: null, meals: null, bus: null, total: 30000 } };
const g10 = pack.schedule.find((g) => g.game_id === 'G10')!;
const pkgs = buildPackages(REQ, g10, data, pack.settings);
const hotels = pack.hotels;

describe('recommendFacts', () => {
  const { facts, allowed } = recommendFacts(g10, REQ, pkgs, hotels);

  it('builds compact facts per option', () => {
    const f = facts as { game: unknown; request: { players: number; caps: unknown }; options: { id: string; miles_to_stadium: number; total: number; team_meals: boolean }[] };
    expect(f.game).toEqual({ opponent: 'Ohio', date: '2026-11-28', kickoff: '12:00' });
    expect(f.request.players).toBe(70);
    expect(f.options.map((o) => o.id)).toEqual(['PKG-G10-A', 'PKG-G10-B', 'PKG-G10-C']);
    expect(f.options[0]!.miles_to_stadium).toBe(9.11);
    expect(f.options[2]!.team_meals).toBe(true);
    expect(f.options[0]!.total).toBe(pkgs[0]!.costs.total);
    expect(JSON.stringify(facts)).not.toMatch(/first_name|last_name|P-0/); // never the roster
  });

  it('allowed covers totals, differences, hotel miles, game date/kickoff, request counts and caps', () => {
    expect(allowed.money).toEqual(expect.arrayContaining(pkgs.map((p) => p.costs.total)));
    expect(allowed.money).toContain(30000);
    expect(allowed.quantities.mile).toEqual(expect.arrayContaining([9.11, 4.44, 0.81]));
    expect(allowed.dates).toContain('2026-11-28');
    expect(allowed.times).toContain('12:00');
    expect(allowed.quantities.player).toContain(70);
    expect(allowed.ids).toEqual(expect.arrayContaining(['PKG-G10-A', 'PKG-G10-B', 'PKG-G10-C']));
  });
});

describe('templateRecommendation', () => {
  it('feasible all → lowest total first; schema-valid; source template', () => {
    const rec = templateRecommendation(pkgs, NOW, { hotels });
    Recommendation.parse(rec);
    const cheapest = [...pkgs].sort((a, b) => a.costs.total - b.costs.total)[0]!;
    expect(rec.recommended_option_id).toBe(cheapest.option_id);
    expect(rec.ranking[0]).toBe(rec.recommended_option_id);
    expect([...rec.ranking].sort()).toEqual(pkgs.map((p) => p.option_id).sort());
    expect(rec).toMatchObject({ source: 'template', fact_guard: { passed: true, replaced: false, issues: [] }, created_at: NOW });
  });

  it('pros/cons come from code comparisons', () => {
    const rec = templateRecommendation(pkgs, NOW, { hotels });
    const t = Object.fromEntries(rec.tradeoffs.map((x) => [x.option_id, x]));
    expect(t['PKG-G10-A']!.pros).toContain('Lowest total estimate');
    expect(t['PKG-G10-C']!.pros).toEqual(expect.arrayContaining(['Closest to the stadium (0.81 mi)', 'Hotel team meals']));
    expect(t['PKG-G10-C']!.cons).toContain('Highest total estimate');
    expect(t['PKG-G10-A']!.cons).toContain('Farthest from the stadium (9.11 mi)');
    for (const x of rec.tradeoffs) for (const s of [...x.pros, ...x.cons]) expect(s.length).toBeLessThanOrEqual(120);
  });

  it('template prose passes the fact guard', () => {
    const rec = templateRecommendation(pkgs, NOW, { hotels });
    const { allowed } = recommendFacts(g10, REQ, pkgs, hotels);
    const text = [rec.explanation, ...rec.tradeoffs.flatMap((t) => [...t.pros, ...t.cons])].join('\n');
    expect(factGuard(text, allowed).issues).toEqual([]);
    expect(rec.explanation).toMatch(/^PKG-G10-A \(Economy\) is recommended at \$/);
  });

  it('ranking: feasible first, then fewer critical flags, fewer warnings, lower total', () => {
    const [A, B, C] = pkgs as [TravelPackage, TravelPackage, TravelPackage];
    const flag = (sev: 'critical' | 'warning', id: string) => ({ code: 'over_cap' as const, severity: sev, message: '', option_id: id, related_item_id: '' });
    const mixed = [
      { ...A, risk_flags: [flag('critical', A.option_id)] },
      { ...B, risk_flags: [flag('warning', B.option_id)] },
      { ...C, feasible: false },
    ];
    expect(rankPackages(mixed).map((p) => p.tier)).toEqual(['B', 'A', 'C']);
  });

  it('pick forces the recommended id and the explanation follows it', () => {
    const rec = templateRecommendation(pkgs, NOW, { hotels, pick: 'PKG-G10-C' });
    expect(rec.recommended_option_id).toBe('PKG-G10-C');
    expect(rec.ranking[0]).toBe('PKG-G10-C');
    expect(rec.explanation.startsWith('PKG-G10-C (Game-Ready)')).toBe(true);
    expect(rec.explanation).toMatch(/more than PKG-G10-A/);
  });

  it('works on fixture packages without hotel data', () => {
    Recommendation.parse(templateRecommendation(fx.FIXTURE_PACKAGES, NOW));
  });
});

describe('memoFacts', () => {
  const pkg = pkgs[1]!;
  const { facts, allowed } = memoFacts(g10, REQ, pkg);

  it('builds compact facts with formatted times, no roster', () => {
    const f = facts as { opponent: string; stadium: string; kickoff: string; option_id: string; estimated_total: number; itinerary: { id: string; time: string }[]; meals: { vendor: string; headcount: number }[]; risks: string[] };
    expect(f).toMatchObject({ opponent: 'Ohio', stadium: g10.stadium_name, kickoff: 'Sat Nov 28, 12:00 PM', option_id: 'PKG-G10-B', estimated_total: pkg.costs.total });
    expect(f.itinerary).toHaveLength(pkg.itinerary.length);
    expect(f.itinerary[0]).toEqual({ id: 'IT-1', time: formatDayTime(pkg.itinerary[0]!.start_local), what: 'Buses depart', where: pkg.itinerary[0]!.location });
    expect(f.meals.every((m) => m.headcount === 94)).toBe(true);
    expect(JSON.stringify(facts)).not.toMatch(/first_name|last_name|P-0/);
  });

  it('allowed.times includes every itinerary start time; dates include the game date', () => {
    for (const i of pkg.itinerary) expect(allowed.times).toContain(i.start_local.slice(11, 16));
    expect(allowed.times).toContain('12:00');
    expect(allowed.dates).toEqual(expect.arrayContaining(['2026-11-27', '2026-11-28']));
    expect(allowed.money).toContain(pkg.costs.total);
    expect(allowed.ids).toContain('PKG-G10-B');
  });

  it('fact guard flags a memo sentence with a time not in the facts', () => {
    const depart = formatDayTime(pkg.departure_local);
    const memo = `## Memo\nBuses depart ${depart}. The team will be up at 3:15 AM for a walk. Estimated total is in the app.`;
    const r = factGuard(memo, allowed);
    expect(r.bad_sentences).toEqual(['The team will be up at 3:15 AM for a walk.']);
    expect(r.issues).toEqual(['3:15 AM is not in the facts']);
  });

  it('a memo built only from FACTS passes', () => {
    const f = facts as { kickoff: string; itinerary: { time: string; what: string }[] };
    const memo = [`Kickoff ${f.kickoff}.`, ...f.itinerary.map((i) => `- ${i.time}: ${i.what}`)].join('\n');
    expect(factGuard(memo, allowed).issues).toEqual([]);
  });
});

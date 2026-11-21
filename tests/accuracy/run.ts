/**
 * AI accuracy harness (A-17). Run against a live or mock server:
 *   npm run dev:server            # other terminal (AIVANA_MOCK=0 for real numbers)
 *   npm run accuracy -- --limit 5 [--base http://localhost:3000] [--skip-recommend]
 * Strictly sequential (500 ms gap), rate-limit aware (busy → back off, max 3 tries), stops on empty credits / spend limit.
 * Writes tests/accuracy/results/latest.json (served by GET /ai/accuracy) and results/run-<timestamp>.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AccuracyReport, FRIENDLY_ERROR, ParseResult, Recommendation, TripDetail, type TripRequestDraft } from '@falcon/shared';
import { CaseFile, aggregate, scoreCase, type CaseScore, type RecommendSample } from './score';

const HERE = dirname(fileURLToPath(import.meta.url));
const GAP_MS = 500;
const MAX_TRIES = 3;
const RECOMMEND_TRIPS = ['TRIP-G12', 'TRIP-G10'];
const RECOMMEND_RUNS = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
class StopRun extends Error {}

function args(argv: string[]) {
  const get = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const limit = get('--limit') ? Number(get('--limit')) : Infinity;
  if (Number.isNaN(limit) || limit < 1) throw new StopRun('--limit must be a positive number');
  return { limit, base: (get('--base') ?? 'http://localhost:3000').replace(/\/$/, ''), skipRecommend: argv.includes('--skip-recommend') };
}

/** One HTTP call with the staff role; retries 429 / ai_busy (retry_after_ms or 2^n s); stops on credits/spend limit. */
async function api(base: string, method: string, path: string, body?: unknown): Promise<{ status: number; json: unknown }> {
  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        method,
        headers: { 'content-type': 'application/json', 'x-role': 'staff' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      throw new StopRun(`Cannot reach ${base} (${(e as Error).message}). Start the server first: npm run dev:server`);
    }
    const json = await res.json().catch(() => null);
    const err = (json as { error?: { code?: string; retry_after_ms?: number } } | null)?.error;
    if (err?.code === 'ai_credits_empty' || err?.code === 'ai_spend_limit') throw new StopRun(`Stopping: ${FRIENDLY_ERROR[err.code]}`);
    if ((res.status === 429 || err?.code === 'ai_busy') && attempt < MAX_TRIES) {
      const wait = err?.retry_after_ms ?? 2 ** attempt * 1000;
      console.warn(`  busy (HTTP ${res.status}) — retrying in ${wait} ms (${attempt}/${MAX_TRIES})`);
      await sleep(wait);
      continue;
    }
    return { status: res.status, json };
  }
}

/** Parse one case. The parse route answers 200 with a fallback draft on AI errors, so read its notice too. */
async function parseCase(base: string, text: string): Promise<{ draft: TripRequestDraft | null; note: string }> {
  for (let attempt = 1; ; attempt++) {
    const r = await api(base, 'POST', '/trips/parse', { text });
    if (r.status !== 200) return { draft: null, note: `HTTP ${r.status}` };
    const p = ParseResult.safeParse(r.json);
    if (!p.success) return { draft: null, note: 'response failed the ParseResult contract' };
    if (p.data.source === 'ai') return { draft: p.data.draft, note: '' };
    const n = p.data.notice;
    if (n.startsWith(FRIENDLY_ERROR.ai_credits_empty) || n.startsWith(FRIENDLY_ERROR.ai_spend_limit)) throw new StopRun(`Stopping: ${n}`);
    if (n.startsWith(FRIENDLY_ERROR.ai_busy) && attempt < MAX_TRIES) {
      const wait = 2 ** attempt * 1000;
      console.warn(`  AI busy — retrying in ${wait} ms (${attempt}/${MAX_TRIES})`);
      await sleep(wait);
      continue;
    }
    return { draft: p.data.draft, note: `fallback: ${n}` }; // scored as-is: this is what staff would see
  }
}

async function recommendChecks(base: string): Promise<RecommendSample[]> {
  const out: RecommendSample[] = [];
  for (const tripId of RECOMMEND_TRIPS) {
    const t = await api(base, 'GET', `/trips/${tripId}`);
    const detail = t.status === 200 ? TripDetail.safeParse(t.json) : null;
    const pkgs = detail?.success ? detail.data.trip.packages : [];
    if (!pkgs.length) {
      console.log(`  ${tripId}: no packages yet — skipped`);
      continue;
    }
    const feasible = new Set(pkgs.filter((p) => p.feasible).map((p) => p.option_id));
    for (let i = 0; i < RECOMMEND_RUNS; i++) {
      await sleep(GAP_MS);
      const r = await api(base, 'POST', `/trips/${tripId}/recommend`);
      const rec = r.status === 200 ? Recommendation.safeParse(r.json) : null;
      if (!rec?.success) {
        out.push({ valid_id: false, guard_clean: false, ai: true });
        console.log(`  ${tripId} #${i + 1}: HTTP ${r.status} / invalid response`);
        continue;
      }
      const d = rec.data;
      const sample = { valid_id: feasible.has(d.recommended_option_id), guard_clean: d.source === 'ai' && d.fact_guard.passed && !d.fact_guard.replaced, ai: d.source === 'ai' };
      out.push(sample);
      console.log(`  ${tripId} #${i + 1}: ${d.recommended_option_id} (${d.source}) valid=${sample.valid_id} guard=${d.fact_guard.passed ? 'pass' : 'fail'}${d.fact_guard.replaced ? ' replaced' : ''}`);
    }
  }
  return out;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

async function main() {
  const opts = args(process.argv.slice(2));
  const health = await api(opts.base, 'GET', '/health');
  const mode = (health.json as { ai_mode?: string } | null)?.ai_mode;
  if (health.status !== 200 || !mode) throw new StopRun(`${opts.base}/health did not answer — is the server running?`);
  const mock = mode === 'mock';
  console.log(`AI accuracy run against ${opts.base} (AI: ${mode})${mode === 'disabled' ? ' — no API key: every parse will fall back' : ''}`);

  const file = CaseFile.parse(JSON.parse(readFileSync(join(HERE, 'cases.json'), 'utf8')));
  const cases = file.cases.slice(0, opts.limit);
  const scores: CaseScore[] = [];
  for (const [i, c] of cases.entries()) {
    if (i > 0) await sleep(GAP_MS);
    const { draft, note } = await parseCase(opts.base, c.text);
    const s = scoreCase(c.id, c.expected, draft);
    scores.push(s);
    const wrong = s.fields.filter((f) => !f.correct).map((f) => `${f.field}=${f.got} (want ${f.expected})`);
    console.log(`  ${c.id} ${s.exact ? 'ok' : 'MISS'}${wrong.length ? ` — ${wrong.join(', ')}` : ''}${note ? ` [${note}]` : ''}`);
  }

  console.log(opts.skipRecommend ? 'Recommendation checks skipped.' : 'Recommendation checks:');
  const recommend = opts.skipRecommend ? [] : await recommendChecks(opts.base);

  const now = new Date().toISOString();
  const report = AccuracyReport.parse(aggregate(scores, { run_at: now, mock, recommend }));
  const dir = join(HERE, 'results');
  mkdirSync(dir, { recursive: true });
  const json = `${JSON.stringify(report, null, 2)}\n`;
  writeFileSync(join(dir, 'latest.json'), json);
  writeFileSync(join(dir, `run-${now.replace(/[:.]/g, '-')}.json`), json);

  console.log('\nfield                    accuracy');
  for (const f of report.per_field) console.log(`${f.field.padEnd(24)} ${pct(f.accuracy).padStart(7)}  (${f.correct}/${f.total})`);
  console.log(`${'overall'.padEnd(24)} ${pct(report.overall_accuracy).padStart(7)}`);
  console.log(`${'exact match'.padEnd(24)} ${pct(report.exact_match_rate).padStart(7)}  (${report.cases_run} cases)`);
  if (recommend.length) {
    console.log(`${'recommend valid id'.padEnd(24)} ${pct(report.recommendation_valid_id_rate).padStart(7)}`);
    console.log(`${'fact guard pass (AI)'.padEnd(24)} ${pct(report.fact_guard_pass_rate).padStart(7)}`);
  }
  console.log(`\nWrote ${join('tests/accuracy/results', 'latest.json')}${mock ? ' (mock: true — rerun with AIVANA_MOCK=0 for real numbers)' : ''}`);
}

main().catch((e) => {
  console.error(e instanceof StopRun ? e.message : e);
  process.exitCode = 1;
});

/** Health, settings, AI usage/accuracy, and dev helpers. */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Router } from 'express';
import { AccuracyReport, type AiCallLog, type AiFeature } from '@falcon/shared';
import { db } from '../db';
import { env, REPO_ROOT } from '../env';
import { sse, staffOnly } from '../http';
import { streamText } from '../aivana/client';
import { seedIfEmpty } from '../repo';
import { repo } from '../repo';
import { computeTripPackages } from '../features/planner';
import { on } from './_define';

export const systemRouter = Router();

on(systemRouter, 'health', () => ({ ok: true as const, version: '0.1.0', ai_mode: env.aiMode, db: db.kind }));

on(systemRouter, 'getSettings', () => repo.settings.get(), staffOnly);
on(systemRouter, 'putSettings', ({ body }) => {
  repo.settings.save(body);
  // costs depend on settings → recompute every non-completed trip that has a request
  for (const t of repo.trips.list()) if (t.request && t.status !== 'completed') repo.trips.save(computeTripPackages(t));
  return repo.settings.get();
}, staffOnly);

on(systemRouter, 'aiUsage', () => {
  const calls: AiCallLog[] = db.listAiCalls(2000);
  const sum = (xs: AiCallLog[], k: 'input_tokens' | 'output_tokens' | 'credits' | 'latency_ms') => xs.reduce((a, c) => a + (c[k] ?? 0), 0);
  const features = [...new Set(calls.map((c) => c.feature))] as AiFeature[];
  return {
    totals: {
      calls: calls.length, errors: calls.filter((c) => !c.ok).length, input_tokens: sum(calls, 'input_tokens'),
      output_tokens: sum(calls, 'output_tokens'), credits: Math.round(sum(calls, 'credits') * 10000) / 10000,
      avg_latency_ms: calls.length ? Math.round(sum(calls, 'latency_ms') / calls.length) : 0,
    },
    by_feature: features.map((f) => {
      const xs = calls.filter((c) => c.feature === f);
      return { feature: f, calls: xs.length, input_tokens: sum(xs, 'input_tokens'), output_tokens: sum(xs, 'output_tokens'), credits: Math.round(sum(xs, 'credits') * 10000) / 10000, avg_input_tokens: Math.round(sum(xs, 'input_tokens') / xs.length) };
    }),
    recent: calls.slice(0, 25),
    mock_mode: env.AIVANA_MOCK,
  };
}, staffOnly);

on(systemRouter, 'aiAccuracy', () => {
  const file = join(REPO_ROOT, 'tests/accuracy/results/latest.json');
  if (!existsSync(file)) return null;
  const r = AccuracyReport.safeParse(JSON.parse(readFileSync(file, 'utf8')));
  return r.success ? r.data : null;
}, staffOnly);

// ---- dev helpers (not in the public contract) ----
/** Phase-0 streaming smoke test for the phone (expo/fetch): GET /dev/stream-test */
systemRouter.get('/dev/stream-test', async (req, res) => {
  const out = sse(res);
  const ac = new AbortController();
  res.on('close', () => ac.abort());
  try {
    await streamText({ feature: 'dev', prompt: 'Count from 1 to 10 in words, one per line.', max_tokens: 60, signal: ac.signal }, (t) => out.send({ type: 'delta', text: t }));
    out.send({ type: 'done', finish_reason: 'stop', unverified_sentences: [] });
  } catch (e) {
    out.send({ type: 'error', code: 'ai_unavailable', message: (e as Error).message });
  }
  out.end();
});

/** Reset the DB to the seeded demo state (rehearsals). */
on(systemRouter, 'resetDemo', () => {
  seedIfEmpty(computeTripPackages, true);
  return { ok: true as const };
}, staffOnly);

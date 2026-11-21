/**
 * Thin Aivana client (our own fetch wrapper — retries, logging and usage tracking under our control).
 *
 *   generateStructured(schema, zod, opts)  → POST /v1/generate with response_format json_schema
 *   generateText(opts)                     → POST /v1/generate
 *   streamText(opts, onDelta)              → POST /v1/generate:stream (SSE: delta | done | error)
 *   chat(messages, opts)                   → generate with `messages` (optionally structured)
 *
 * Rules: web_search always false · retry only 429 rate-limit / 502 / 504 / network, max 3 attempts,
 * honor Retry-After else exponential backoff + jitter · every call logged to ai_calls · AIVANA_MOCK=1
 * returns canned schema-valid output with no network.
 */
import type { z } from 'zod';
import { assertAivanaSchema, type AiFeature, type JsonSchema } from '@falcon/shared';
import { env } from '../env';
import { db } from '../db';
import { AiError, mapAivanaError } from './errors';
import { mockGenerate, mockStream } from './mock';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export interface CallOpts {
  feature: AiFeature;
  system?: string;
  prompt?: string;
  messages?: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  effort?: 'auto' | 'low' | 'medium' | 'high';
  signal?: AbortSignal;
}
export interface Usage { input_tokens: number; cached_tokens: number; output_tokens: number; credits: number }
export interface CallMeta { request_id: string; usage: Usage; latency_ms: number; finish_reason: string; attempts: number; mock: boolean; notices: unknown[] }

const MAX_ATTEMPTS = 3;
const ZERO: Usage = { input_tokens: 0, cached_tokens: 0, output_tokens: 0, credits: 0 };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const backoff = (attempt: number) => Math.min(8000, 500 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 250);

function body(opts: CallOpts, extra: Record<string, unknown> = {}) {
  if (!opts.prompt && !opts.messages?.length) throw new Error('prompt or messages required');
  if (opts.messages && opts.messages.length > 40) throw new Error('Aivana allows at most 40 messages');
  return {
    ...(opts.messages ? { messages: opts.messages } : { prompt: opts.prompt }),
    ...(opts.system ? { system: opts.system } : {}),
    max_tokens: opts.max_tokens ?? 800,
    temperature: opts.temperature ?? 0.2,
    effort: opts.effort ?? 'low',
    web_search: false,
    ...extra,
  };
}

function log(feature: AiFeature, endpoint: 'generate' | 'stream', ok: boolean, meta: Partial<CallMeta>, error_code = '') {
  const u = meta.usage ?? ZERO;
  try {
    db.insertAiCall({
      feature, endpoint, ok, error_code,
      input_tokens: u.input_tokens ?? 0, cached_tokens: u.cached_tokens ?? 0, output_tokens: u.output_tokens ?? 0,
      credits: u.credits ?? 0, latency_ms: meta.latency_ms ?? 0, request_id: meta.request_id ?? '',
      attempts: meta.attempts ?? 1, mock: meta.mock ?? false,
    });
  } catch (e) {
    console.warn('[aivana] failed to log usage', (e as Error).message);
  }
  const tag = ok ? 'ok' : `ERR ${error_code}`;
  console.log(`[aivana] ${feature} ${endpoint} ${tag} req=${meta.request_id ?? '-'} in=${u.input_tokens} out=${u.output_tokens} ${meta.latency_ms ?? 0}ms${meta.mock ? ' (mock)' : ''}`);
}

function ensureConfigured() {
  if (env.aiMode === 'disabled') throw new AiError('ai_auth', 'AIVANA_API_KEY is not set (and AIVANA_MOCK is off)', false, 0);
}

/** POST with retries. Returns parsed JSON body on 2xx. */
async function postWithRetry(path: string, payload: unknown, signal?: AbortSignal): Promise<{ json: Record<string, unknown>; attempts: number; res: Response }> {
  let lastErr: AiError | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(env.AIVANA_BASE_URL + path, {
        method: 'POST',
        headers: { 'X-API-Key': env.AIVANA_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal,
      });
    } catch (e) {
      if (signal?.aborted) throw e;
      lastErr = new AiError('ai_unavailable', `network error: ${(e as Error).message}`, true, 0);
      if (attempt < MAX_ATTEMPTS) await sleep(backoff(attempt));
      continue;
    }
    if (res.ok) {
      if (path.endsWith(':stream')) return { json: {}, attempts: attempt, res };
      return { json: (await res.json()) as Record<string, unknown>, attempts: attempt, res };
    }
    let errBody: unknown = undefined;
    try {
      errBody = await res.json();
    } catch {
      /* non-JSON error body */
    }
    lastErr = mapAivanaError(res.status, errBody, res.headers.get('retry-after'));
    console.warn(`[aivana] ${path} HTTP ${res.status} ${lastErr.code} (attempt ${attempt}/${MAX_ATTEMPTS}) req=${lastErr.requestId ?? '-'}`);
    if (!lastErr.retryable || attempt === MAX_ATTEMPTS) throw lastErr;
    await sleep(lastErr.retryAfterMs ?? backoff(attempt));
  }
  throw lastErr ?? new AiError('ai_unavailable', 'unknown failure', false, 0);
}

function metaFrom(json: Record<string, unknown>, started: number, attempts: number, mock: boolean): CallMeta {
  return {
    request_id: String(json.request_id ?? json.id ?? ''),
    usage: { ...ZERO, ...((json.usage as Usage) ?? {}) },
    latency_ms: Date.now() - started,
    finish_reason: String(json.finish_reason ?? 'stop'),
    attempts,
    mock,
    notices: (json.notices as unknown[]) ?? [],
  };
}

async function generateRaw(opts: CallOpts, schema?: JsonSchema): Promise<{ json: Record<string, unknown>; meta: CallMeta }> {
  const started = Date.now();
  if (schema) assertAivanaSchema(schema);
  if (env.AIVANA_MOCK) {
    const json = await mockGenerate(opts, schema);
    const meta = metaFrom(json, started, 1, true);
    log(opts.feature, 'generate', true, meta);
    return { json, meta };
  }
  try {
    ensureConfigured();
    const payload = body(opts, schema ? { response_format: { type: 'json_schema', schema } } : {});
    const { json, attempts } = await postWithRetry('/v1/generate', payload, opts.signal);
    const meta = metaFrom(json, started, attempts, false);
    log(opts.feature, 'generate', true, meta);
    return { json, meta };
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError('ai_unavailable', (e as Error).message, false, 0);
    log(opts.feature, 'generate', false, { latency_ms: Date.now() - started, request_id: err.requestId }, err.code);
    throw err;
  }
}

/** Structured output. Re-validates `structured` with our Zod mirror (schema-valid ≠ true; still check IDs/facts in callers). */
export async function generateStructured<T>(schema: JsonSchema, zod: z.ZodType<T>, opts: CallOpts): Promise<{ data: T; meta: CallMeta }> {
  const { json, meta } = await generateRaw(opts, schema);
  if (meta.finish_reason === 'length') throw new AiError('ai_bad_output', 'AI output was cut off (max_tokens)', true, 200, meta.request_id);
  let candidate = json.structured;
  if (candidate === undefined || candidate === null) {
    try {
      candidate = JSON.parse(String(json.answer ?? ''));
    } catch {
      throw new AiError('ai_bad_output', `no structured output (${String(json.structured_error ?? 'unknown')})`, true, 200, meta.request_id);
    }
  }
  const r = zod.safeParse(candidate);
  if (!r.success) throw new AiError('ai_bad_output', `structured output failed validation: ${r.error.issues[0]?.message}`, true, 200, meta.request_id);
  return { data: r.data, meta };
}

export async function generateText(opts: CallOpts): Promise<{ text: string; meta: CallMeta }> {
  const { json, meta } = await generateRaw(opts);
  return { text: String(json.answer ?? ''), meta };
}

/** Multi-turn. Pass the already-trimmed history (callers keep it short). */
export async function chat<T>(messages: ChatMessage[], opts: Omit<CallOpts, 'messages' | 'prompt'> & { schema?: JsonSchema; zod?: z.ZodType<T> }) {
  if (opts.schema && opts.zod) return generateStructured(opts.schema, opts.zod, { ...opts, messages });
  return generateText({ ...opts, messages });
}

/** Parse an SSE byte stream into {event, data} records. */
async function* readSse(stream: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: string }> {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.search(/\r?\n\r?\n/)) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx).replace(/^\r?\n\r?\n/, '');
      let event = 'message';
      const data: string[] = [];
      for (const line of chunk.split(/\r?\n/)) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
      }
      if (data.length) yield { event, data: data.join('\n') };
    }
  }
}

/**
 * Streaming text. Calls onDelta for each chunk. Retries only happen before the first delta
 * (postWithRetry). An `error` event after HTTP 200 throws AiError.
 */
export async function streamText(opts: CallOpts, onDelta: (text: string) => void): Promise<{ text: string; meta: CallMeta }> {
  const started = Date.now();
  if (env.AIVANA_MOCK) {
    let text = '';
    for await (const d of mockStream(opts)) {
      if (opts.signal?.aborted) break;
      text += d;
      onDelta(d);
    }
    const meta = metaFrom({ request_id: 'mock', usage: { input_tokens: Math.round((opts.prompt?.length ?? 400) / 4), output_tokens: Math.round(text.length / 4), cached_tokens: 0, credits: 0 } }, started, 1, true);
    log(opts.feature, 'stream', true, meta);
    return { text, meta };
  }
  let attempts = 1;
  let requestId = '';
  try {
    ensureConfigured();
    const r = await postWithRetry('/v1/generate:stream', body(opts), opts.signal);
    attempts = r.attempts;
    requestId = r.res.headers.get('x-request-id') ?? '';
    if (!r.res.body) throw new AiError('ai_unavailable', 'empty stream body', true, 200);
    let text = '';
    let doneJson: Record<string, unknown> = {};
    for await (const ev of readSse(r.res.body)) {
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(ev.data) as Record<string, unknown>;
      } catch {
        continue;
      }
      const type = ev.event !== 'message' ? ev.event : String(data.type ?? '');
      if (type === 'delta') {
        const t = String(data.text ?? '');
        text += t;
        onDelta(t);
      } else if (type === 'done') {
        doneJson = data;
      } else if (type === 'error') {
        const errObj = (data.error ?? data) as Record<string, unknown>;
        throw new AiError(String(errObj.code) === 'insufficient_credit' ? 'ai_credits_empty' : 'ai_unavailable', String(errObj.message ?? 'stream error'), false, 200, String(data.request_id ?? requestId));
      } // ignore other event types
    }
    const meta = metaFrom({ request_id: requestId, ...doneJson }, started, attempts, false);
    log(opts.feature, 'stream', true, meta);
    return { text, meta };
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError('ai_unavailable', (e as Error).message, false, 0);
    log(opts.feature, 'stream', false, { latency_ms: Date.now() - started, request_id: err.requestId ?? requestId, attempts }, err.code);
    throw err;
  }
}

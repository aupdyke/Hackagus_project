/** Live-path tests for the Aivana client against a fake fetch (no network, no credits). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const SCHEMA = { type: 'object', additionalProperties: false, required: ['a'], properties: { a: { type: 'string' } } };

function jsonRes(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}
function sseRes(events: string) {
  return new Response(new Blob([events]).stream(), { status: 200, headers: { 'Content-Type': 'text/event-stream', 'x-request-id': 'req-s' } });
}

async function loadClient() {
  vi.resetModules();
  process.env.AIVANA_MOCK = '0';
  process.env.AIVANA_API_KEY = 'test-key';
  return import('./client');
}

describe('aivana client (live path, fake fetch)', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.AIVANA_MOCK = '1';
    delete process.env.AIVANA_API_KEY;
  });

  it('retries 429 honoring retry_after_ms, then returns validated structured output', async () => {
    const { generateStructured } = await loadClient();
    fetchMock
      .mockResolvedValueOnce(jsonRes(429, { error: { code: 'rate_limit_exceeded', message: 'slow down', retry_after_ms: 5 } }))
      .mockResolvedValueOnce(jsonRes(200, { request_id: 'r1', structured: { a: 'ok' }, answer: '{"a":"ok"}', usage: { input_tokens: 10, output_tokens: 3, cached_tokens: 0, credits: 0.01 }, finish_reason: 'stop' }));
    const { data, meta } = await generateStructured(SCHEMA, z.object({ a: z.string() }), { feature: 'dev', prompt: 'x' });
    expect(data).toEqual({ a: 'ok' });
    expect(meta.attempts).toBe(2);
    const sent = JSON.parse(fetchMock.mock.calls[1]![1].body);
    expect(sent.web_search).toBe(false);
    expect(sent.response_format.type).toBe('json_schema');
    expect(fetchMock.mock.calls[0]![1].headers['X-API-Key']).toBe('test-key');
  });

  it('does not retry 402 and maps to ai_credits_empty', async () => {
    const { generateText } = await loadClient();
    fetchMock.mockResolvedValue(jsonRes(402, { error: { code: 'insufficient_credit', message: 'empty' } }));
    await expect(generateText({ feature: 'dev', prompt: 'x' })).rejects.toMatchObject({ code: 'ai_credits_empty' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry spend_limit_reached', async () => {
    const { generateText } = await loadClient();
    fetchMock.mockResolvedValue(jsonRes(429, { error: { code: 'spend_limit_reached', message: 'limit' } }));
    await expect(generateText({ feature: 'dev', prompt: 'x' })).rejects.toMatchObject({ code: 'ai_spend_limit' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects structured output that fails our zod mirror', async () => {
    const { generateStructured } = await loadClient();
    fetchMock.mockResolvedValue(jsonRes(200, { request_id: 'r2', structured: { a: 5 }, finish_reason: 'stop' }));
    await expect(generateStructured(SCHEMA, z.object({ a: z.string() }), { feature: 'dev', prompt: 'x' })).rejects.toMatchObject({ code: 'ai_bad_output' });
  });

  it('parses SSE deltas, ignores unknown events, and surfaces error events after HTTP 200', async () => {
    const { streamText } = await loadClient();
    fetchMock.mockResolvedValueOnce(sseRes('event: delta\ndata: {"text":"Hel"}\n\nevent: ping\ndata: {}\n\nevent: delta\ndata: {"text":"lo"}\n\nevent: done\ndata: {"finish_reason":"stop","usage":{"input_tokens":5,"output_tokens":2}}\n\n'));
    const chunks: string[] = [];
    const { text, meta } = await streamText({ feature: 'dev', prompt: 'x' }, (t) => chunks.push(t));
    expect(text).toBe('Hello');
    expect(chunks).toEqual(['Hel', 'lo']);
    expect(meta.usage.output_tokens).toBe(2);

    fetchMock.mockResolvedValueOnce(sseRes('event: delta\ndata: {"text":"a"}\n\nevent: error\ndata: {"error":{"code":"insufficient_credit","message":"empty"}}\n\n'));
    await expect(streamText({ feature: 'dev', prompt: 'x' }, () => {})).rejects.toMatchObject({ code: 'ai_credits_empty' });
  });
});

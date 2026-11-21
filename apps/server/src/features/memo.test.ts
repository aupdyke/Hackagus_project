/** A-08: streamed memo in mock mode → delta events, then done; saved memo carries the same unverified sentences. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { StreamEvent } from '@falcon/shared';
import { startTestServer } from '../test/server';
import { repo } from '../repo';
import { MEMO_SYSTEM } from './memo';

let srv: Awaited<ReturnType<typeof startTestServer>>;
beforeAll(async () => {
  srv = await startTestServer();
});
afterAll(async () => {
  await srv?.close();
});

async function readEvents(path: string) {
  const res = await fetch(`${srv.url}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-role': 'staff' }, body: '{}' });
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
  const raw = await res.text();
  return raw.split('\n').filter((l) => l.startsWith('data: ')).map((l) => StreamEvent.parse(JSON.parse(l.slice(6))));
}

describe('POST /trips/:id/memo/stream (mock)', () => {
  it('streams deltas then done; saved memo matches', async () => {
    const events = await readEvents('/trips/TRIP-G12/memo/stream');
    expect(events.length).toBeGreaterThan(2);
    const done = events.at(-1)!;
    expect(done.type).toBe('done');
    expect(events.slice(0, -1).every((e) => e.type === 'delta')).toBe(true);
    const text = events.filter((e) => e.type === 'delta').map((e) => (e as { text: string }).text).join('');
    const memo = repo.trips.get('TRIP-G12')!.memo!;
    expect(memo.markdown).toBe(text);
    expect(memo.unverified_sentences).toEqual((done as { unverified_sentences: string[] }).unverified_sentences);
    expect(memo.option_id).toMatch(/^PKG-G12-[ABC]$/);
  });

  it('system prompt is short and asks for estimate labels', () => {
    expect(MEMO_SYSTEM.split(/\s+/).length).toBeLessThan(150);
    expect(MEMO_SYSTEM).toMatch(/estimate/i);
  });
});

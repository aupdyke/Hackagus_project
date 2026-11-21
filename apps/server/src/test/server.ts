/**
 * Test helper: reset + seed the (in-memory, VITEST) DB, start the real Express app on a random port.
 *   const srv = await startTestServer();  await fetch(`${srv.url}/health`);  await srv.close();
 */
import type { AddressInfo } from 'node:net';
import { createApp } from '../app';
import { seedIfEmpty } from '../repo';
import { computeTripPackages } from '../features/planner';

export interface TestServer {
  url: string;
  close: () => Promise<void>;
}

export async function startTestServer(): Promise<TestServer> {
  if (!process.env.VITEST) throw new Error('startTestServer is for tests only (it wipes the DB)');
  seedIfEmpty(computeTripPackages, true);
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Small fetch wrapper: JSON body + staff role by default. */
export async function call(url: string, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${url}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-role': 'staff', ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, headers: res.headers, json: json as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/**
 * Read our server's SSE relay on React Native. The built-in RN fetch cannot stream bodies, so we use
 * `fetch` from `expo/fetch` (ReadableStream support). Fallback if this ever breaks: `react-native-sse`.
 * Server events are `data: {"type":"delta"|"done"|"error", ...}\n\n` (shared StreamEvent).
 */
import { fetch as expoFetch } from 'expo/fetch';
import { ApiClientError, ApiErrorBody, StreamEvent } from '@falcon/shared';
import { getSession } from './role';

export interface StreamOpts {
  url: string;
  method?: 'GET' | 'POST';
  body?: unknown;
  signal?: AbortSignal;
  onEvent: (ev: StreamEvent) => void;
}

export async function streamSse({ url, method = 'POST', body, signal, onEvent }: StreamOpts): Promise<void> {
  const s = getSession();
  const res = await expoFetch(url, {
    method,
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
      ...(s.role ? { 'X-Role': s.role } : {}),
      ...(s.athleteId ? { 'X-Athlete-Id': s.athleteId } : {}),
    },
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
    signal,
  });
  if (!res.ok) {
    const parsed = ApiErrorBody.safeParse(await res.json().catch(() => null));
    if (parsed.success) throw new ApiClientError(parsed.data.error.code, parsed.data.error.message, res.status, parsed.data.error.retryable);
    throw new ApiClientError('internal', `HTTP ${res.status}`, res.status, false);
  }
  if (!res.body) throw new ApiClientError('internal', 'No stream body', res.status, false);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data:')) continue;
        try {
          const ev = StreamEvent.safeParse(JSON.parse(line.slice(5).trim()));
          if (ev.success) onEvent(ev.data);
        } catch {
          /* ignore malformed line */
        }
      }
    }
  }
}

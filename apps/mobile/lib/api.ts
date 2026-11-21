/** Typed API client generated from the shared contract. Usage: `api.getTrip({ params: { id } })`. */
import { ApiClientError, FRIENDLY_ERROR, createApiClient, type ErrorCode } from '@falcon/shared';
import { API_URL } from './config';
import { getSession } from './role';

export const api = createApiClient({
  baseUrl: API_URL,
  headers: () => {
    const s = getSession();
    const h: Record<string, string> = {};
    if (s.role) h['X-Role'] = s.role;
    if (s.athleteId) h['X-Athlete-Id'] = s.athleteId;
    return h;
  },
});

/** Human message for any error thrown by the client. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiClientError) {
    if (e.code === 'network') return e.message;
    if (e.code === 'contract') return `App/server mismatch: ${e.message}`;
    if (e.code === 'validation_failed' || e.code === 'conflict' || e.code === 'not_found') return e.message;
    return FRIENDLY_ERROR[e.code as ErrorCode] ?? e.message;
  }
  return e instanceof Error ? e.message : 'Something went wrong';
}
export const isAiError = (e: unknown) => e instanceof ApiClientError && String(e.code).startsWith('ai_');

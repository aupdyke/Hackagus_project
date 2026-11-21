import { z } from 'zod';

/** Every server error uses this shape: `{ error: { code, message, retryable, request_id? } }` */
export const ErrorCode = z.enum([
  'bad_request',
  'validation_failed',
  'not_found',
  'forbidden',
  'conflict',
  'not_implemented',
  'internal',
  // AI-specific (mapped from Aivana errors by apps/server/src/aivana/client.ts)
  'ai_busy', // 429 rate limit after retries exhausted
  'ai_credits_empty', // 402 insufficient_credit
  'ai_spend_limit', // 429 spend_limit_reached
  'ai_unavailable', // 5xx / network after retries, or no key configured
  'ai_bad_output', // 502 structured_output_failed after retries, or output failed our validation
  'ai_auth', // 401/403 — server misconfiguration
  'ai_request_invalid', // 400/413/422 — our bug
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ApiErrorBody = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    retryable: z.boolean(),
    request_id: z.string().optional(),
    details: z.unknown().optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;

/** Friendly copy the app shows for each code (mobile may override). */
export const FRIENDLY_ERROR: Record<ErrorCode, string> = {
  bad_request: 'That request did not look right. Please check the fields and try again.',
  validation_failed: 'Some fields are missing or invalid.',
  not_found: 'We could not find that.',
  forbidden: 'You do not have access to that.',
  conflict: 'That action is not allowed in the current state.',
  not_implemented: 'This feature is still being built.',
  internal: 'Something went wrong on the server.',
  ai_busy: 'AI is busy, retrying… try again in a moment.',
  ai_credits_empty: 'AI credits are empty — the planner still works, AI features are paused.',
  ai_spend_limit: 'AI spend limit reached — the planner still works, AI features are paused.',
  ai_unavailable: 'AI is unavailable right now — the planner still works without it.',
  ai_bad_output: 'AI returned an answer we could not verify, so we did not use it.',
  ai_auth: 'AI is not configured on the server (key problem). The planner still works.',
  ai_request_invalid: 'AI request was rejected (our bug). The planner still works.',
};

/** Thrown by pure logic stubs that a task has not implemented yet. */
export class NotImplementedError extends Error {
  constructor(public readonly taskId: string) {
    super(`Not implemented yet (task ${taskId})`);
    this.name = 'NotImplementedError';
  }
}

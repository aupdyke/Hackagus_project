import type { ErrorCode } from '@falcon/shared';

export type AiErrorCode = Extract<ErrorCode, `ai_${string}`>;

export class AiError extends Error {
  constructor(
    public readonly code: AiErrorCode,
    message: string,
    public readonly retryable: boolean,
    public readonly status: number,
    public readonly requestId?: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

/** Map an Aivana HTTP error to our code + whether *we* should retry it. */
export function mapAivanaError(status: number, body: unknown, retryAfterHeader: string | null): AiError {
  const b = (body ?? {}) as Record<string, unknown>;
  const errObj = (typeof b.error === 'object' && b.error ? b.error : b) as Record<string, unknown>;
  const apiCode = String(errObj.code ?? (typeof b.error === 'string' ? b.error : '') ?? '');
  const message = String(errObj.message ?? `Aivana HTTP ${status}`);
  const requestId = (b.request_id ?? errObj.request_id) as string | undefined;
  let retryAfterMs: number | undefined;
  if (typeof errObj.retry_after_ms === 'number') retryAfterMs = errObj.retry_after_ms;
  else if (typeof b.retry_after_ms === 'number') retryAfterMs = b.retry_after_ms;
  else if (retryAfterHeader && !Number.isNaN(Number(retryAfterHeader))) retryAfterMs = Number(retryAfterHeader) * 1000;

  if (status === 429 && apiCode === 'spend_limit_reached') return new AiError('ai_spend_limit', message, false, status, requestId);
  if (status === 429) return new AiError('ai_busy', message, true, status, requestId, retryAfterMs);
  if (status === 402) return new AiError('ai_credits_empty', message, false, status, requestId);
  if (status === 401 || status === 403) return new AiError('ai_auth', message, false, status, requestId);
  if (status === 502 && apiCode === 'structured_output_failed') return new AiError('ai_bad_output', message, true, status, requestId);
  if (status === 502 || status === 504) return new AiError('ai_unavailable', message, true, status, requestId);
  if (status === 400 || status === 413 || status === 422) return new AiError('ai_request_invalid', `${apiCode}: ${message}`, false, status, requestId);
  if (status >= 500) return new AiError('ai_unavailable', message, false, status, requestId);
  return new AiError('ai_request_invalid', `${apiCode}: ${message}`, false, status, requestId);
}

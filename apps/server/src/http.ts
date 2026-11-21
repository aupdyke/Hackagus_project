/** HTTP helpers: errors, validation, response contract checks, role scoping, SSE. */
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { z } from 'zod';
import { FRIENDLY_ERROR, NotImplementedError, type ErrorCode, type StreamEvent } from '@falcon/shared';
import { AiError } from './aivana/errors';

export class HttpError extends Error {
  constructor(public status: number, public code: ErrorCode, message: string, public retryable = false, public details?: unknown, public requestId?: string) {
    super(message);
  }
}
export const notFound = (what: string) => new HttpError(404, 'not_found', `${what} not found`);
export const conflict = (msg: string) => new HttpError(409, 'conflict', msg);
export const badRequest = (msg: string, details?: unknown) => new HttpError(400, 'validation_failed', msg, false, details);

/** Validate a request body/query with Zod; throws 400 with issue list. */
export function parse<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const r = schema.safeParse(value);
  if (!r.success) {
    const issues = r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw badRequest(`Invalid input: ${issues.map((i) => `${i.path || '(root)'} ${i.message}`).join('; ')}`, issues);
  }
  return r.data;
}

/** Send JSON after checking it matches the response contract (catches drift early). */
export function send<T extends z.ZodType>(res: Response, schema: T, data: z.input<T>, status = 200): void {
  const r = schema.safeParse(data);
  if (!r.success) {
    console.error('[contract] response did not match schema', r.error.issues.slice(0, 5));
    throw new HttpError(500, 'internal', 'Response failed contract validation (server bug)', false, r.error.issues.slice(0, 5));
  }
  res.status(status).json(r.data);
}

/** Try real logic; if a shared function is still a stub, use the fixture (header X-Fixture: <task>). */
export function orFixture<T>(res: Response, real: () => T, fixture: () => T): T {
  try {
    return real();
  } catch (e) {
    if (e instanceof NotImplementedError) {
      res.setHeader('X-Fixture', e.taskId);
      return fixture();
    }
    throw e;
  }
}
export function isStub(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch (e) {
    return e instanceof NotImplementedError;
  }
}

// ---- role scoping (NOT authentication — see README "No real auth") ----
export type Role = 'staff' | 'athlete';
export function roleOf(req: Request): { role: Role | null; athleteId: string | null } {
  const role = req.header('x-role');
  return { role: role === 'staff' || role === 'athlete' ? role : null, athleteId: req.header('x-athlete-id') ?? null };
}
/** Staff-only routes reject requests that identify as athletes. */
export function staffOnly(req: Request, _res: Response, next: NextFunction) {
  if (roleOf(req).role === 'athlete') return next(new HttpError(403, 'forbidden', 'Staff only'));
  next();
}
/** Athlete routes: an athlete may only access their own :id. */
export function selfOnly(req: Request, _res: Response, next: NextFunction) {
  const { role, athleteId } = roleOf(req);
  if (role === 'athlete' && athleteId !== req.params.id) return next(new HttpError(403, 'forbidden', 'Athletes can only access their own trip data'));
  next();
}

// ---- errors ----
export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (res.headersSent) return;
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, retryable: err.retryable, request_id: err.requestId, details: err.details } });
    return;
  }
  if (err instanceof AiError) {
    const status = err.code === 'ai_busy' || err.code === 'ai_spend_limit' ? 429 : err.code === 'ai_credits_empty' ? 402 : 503;
    // Always give the app an id to quote: Aivana's request id, else a local one (logged so it can be traced).
    const request_id = err.requestId || `local-${randomUUID()}`;
    if (!err.requestId) console.warn(`[ai] ${err.code} without Aivana request id → ${request_id}: ${err.message}`);
    res.status(status).json({ error: { code: err.code, message: FRIENDLY_ERROR[err.code], retryable: err.code === 'ai_busy' || err.retryable, request_id } });
    return;
  }
  if (err instanceof NotImplementedError) {
    res.status(501).json({ error: { code: 'not_implemented', message: err.message, retryable: false } });
    return;
  }
  if (err instanceof SyntaxError && 'body' in (err as object)) {
    res.status(400).json({ error: { code: 'bad_request', message: 'Malformed JSON body', retryable: false } });
    return;
  }
  console.error('[error]', err);
  res.status(500).json({ error: { code: 'internal', message: 'Internal server error', retryable: true } });
}

// ---- SSE relay to the app ----
export function sse(res: Response) {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable proxy buffering (Render/nginx)
  res.flushHeaders();
  return {
    send(ev: StreamEvent) {
      res.write(`data: ${JSON.stringify(ev)}\n\n`);
    },
    end() {
      res.end();
    },
  };
}

/**
 * API contract: every route's method, path, request body/query and response schema.
 * The server validates bodies with these; the mobile app uses `createApiClient` (fully typed).
 *
 * Adding a route: add it to `routes`, implement it in apps/server/src/routes/*, done — the client picks it up.
 */
import { z } from 'zod';
import {
  AccuracyReport, ActualsInput, AiUsageSummary, AssistantReply, AthleteNotification, BudgetVsActual,
  ChatTurn, PackageDiff, Packet, ParseResult, PatchOp, Player, Recommendation, Rooming, RoommateRequest,
  SavingsResult, SeasonRollup, Settings, Trip, TripDetail, TripRequest, TripSummary, MyTripResponse,
} from './domain';
import { ApiErrorBody, type ErrorCode } from './errors';

type Method = 'GET' | 'POST' | 'PUT';
export interface RouteDef {
  method: Method;
  path: string;
  body?: z.ZodType;
  query?: z.ZodType;
  response: z.ZodType;
  /** SSE endpoints are not callable through the JSON client; use `streamUrl` */
  stream?: true;
}

const Ok = z.object({ ok: z.literal(true) });

export const HealthResponse = z.object({
  ok: z.literal(true),
  version: z.string(),
  ai_mode: z.enum(['mock', 'live', 'disabled']),
  db: z.enum(['sqlite', 'json']),
});

export const ParseRequest = z.object({ text: z.string().min(3).max(1000) });
export const SelectRequest = z.object({ option_id: z.string() });
export const WhatIfRequest = z.object({ message: z.string().min(1).max(500) });
export const WhatIfResponse = z.object({
  reply: z.string(),
  needs_clarification: z.boolean(),
  clarifying_question: z.string(),
  patch_ops: z.array(PatchOp),
  rejected_ops: z.array(z.object({ op: z.unknown(), reason: z.string() })),
  applied: z.boolean(),
  diff: z.array(PackageDiff),
  trip: Trip,
  source: z.enum(['ai', 'fallback']),
});
export const MemoStreamRequest = z.object({ option_id: z.string().optional() });
export const RoomingUpdate = z.object({ rooms: Rooming.shape.rooms });
export const PacketQuery = z.object({
  audience: z.enum(['staff', 'athlete']),
  athleteId: z.string().optional(),
});
export const SavingsRequest = z.object({ target: z.enum(['budget']).default('budget') });
export const RoommateRequestBody = z.object({ trip_id: z.string(), requested_ids: z.array(z.string()).max(2) });
export const AssistantRequest = z.object({
  message: z.string().min(1).max(400),
  /** client keeps history; server trims to the last 6 turns */
  history: z.array(ChatTurn).max(20).default([]),
});
export const AthleteListItem = Player.pick({ id: true, first_name: true, last_name: true, jersey: true, position: true, position_group: true, class_year: true });
export const TravelRosterItem = z.object({ id: z.string(), name: z.string(), position_group: z.string(), class_year: z.string() });

export const routes = {
  health: { method: 'GET', path: '/health', response: HealthResponse },

  getSettings: { method: 'GET', path: '/settings', response: Settings },
  putSettings: { method: 'PUT', path: '/settings', body: Settings, response: Settings },

  getSeason: { method: 'GET', path: '/season', response: SeasonRollup },
  seasonSavings: { method: 'POST', path: '/season/savings', body: SavingsRequest, response: SavingsResult },
  /** apply chosen candidates (code switches packages / reduces travelers) and return the new roll-up */
  applySavings: { method: 'POST', path: '/season/savings/apply', body: z.object({ candidate_ids: z.array(z.string()).min(1) }), response: SeasonRollup },

  listTrips: { method: 'GET', path: '/trips', response: z.array(TripSummary) },
  getTrip: { method: 'GET', path: '/trips/:id', response: TripDetail },
  /** form submit (already human-reviewed) → stores request, status draft, computes packages */
  submitRequest: { method: 'POST', path: '/trips/:gameId/request', body: TripRequest, response: TripDetail },
  /** free text → draft for human review (does NOT compute costs) */
  parseRequest: { method: 'POST', path: '/trips/parse', body: ParseRequest, response: ParseResult },
  computePackages: { method: 'POST', path: '/trips/:id/packages', response: TripDetail },
  recommend: { method: 'POST', path: '/trips/:id/recommend', response: Recommendation },
  whatIf: { method: 'POST', path: '/trips/:id/whatif', body: WhatIfRequest, response: WhatIfResponse },
  memoStream: { method: 'POST', path: '/trips/:id/memo/stream', body: MemoStreamRequest, response: z.unknown(), stream: true },
  selectPackage: { method: 'POST', path: '/trips/:id/select', body: SelectRequest, response: TripDetail },
  approveTrip: { method: 'POST', path: '/trips/:id/approve', response: TripDetail },
  publishTrip: { method: 'POST', path: '/trips/:id/publish', response: TripDetail },

  getRooming: { method: 'GET', path: '/trips/:id/rooming', response: Rooming.nullable() },
  generateRooming: { method: 'POST', path: '/trips/:id/rooming/generate', response: Rooming },
  updateRooming: { method: 'PUT', path: '/trips/:id/rooming', body: RoomingUpdate, response: Rooming },

  getPacket: { method: 'GET', path: '/trips/:id/packet', query: PacketQuery, response: Packet },

  postActuals: { method: 'POST', path: '/trips/:id/actuals', body: ActualsInput, response: BudgetVsActual },
  budgetVsActual: { method: 'GET', path: '/trips/:id/budget-vs-actual', response: BudgetVsActual },

  listAthletes: { method: 'GET', path: '/athletes', response: z.array(AthleteListItem) },
  myTrip: { method: 'GET', path: '/athletes/:id/my-trip', response: MyTripResponse },
  travelRoster: { method: 'GET', path: '/athletes/:id/travel-roster/:tripId', response: z.array(TravelRosterItem) },
  getRoommateRequest: { method: 'GET', path: '/athletes/:id/roommate-requests/:tripId', response: RoommateRequest.nullable() },
  roommateRequest: { method: 'POST', path: '/athletes/:id/roommate-requests', body: RoommateRequestBody, response: RoommateRequest },
  assistant: { method: 'POST', path: '/athletes/:id/assistant', body: AssistantRequest, response: AssistantReply },
  notifications: { method: 'GET', path: '/athletes/:id/notifications', response: z.array(AthleteNotification) },
  markNotificationsRead: { method: 'POST', path: '/athletes/:id/notifications/read', body: z.object({ ids: z.array(z.string()) }), response: Ok },

  aiUsage: { method: 'GET', path: '/ai/usage', response: AiUsageSummary },
  aiAccuracy: { method: 'GET', path: '/ai/accuracy', response: AccuracyReport.nullable() },

  /** demo rehearsal: wipe DB and re-seed from data/*.json */
  resetDemo: { method: 'POST', path: '/dev/reset', response: Ok },
} as const satisfies Record<string, RouteDef>;

export type Routes = typeof routes;
export type RouteName = keyof Routes;

// ---------- typed client ----------
type PathParams<P extends string> = P extends `${string}:${infer Param}/${infer Rest}`
  ? Param | PathParams<`/${Rest}`>
  : P extends `${string}:${infer Param}`
    ? Param
    : never;

type ParamsArg<R extends RouteDef> = [PathParams<R['path']>] extends [never]
  ? { params?: undefined }
  : { params: Record<PathParams<R['path']>, string> };
type BodyArg<R extends RouteDef> = R extends { body: infer B extends z.ZodType } ? { body: z.input<B> } : { body?: undefined };
type QueryArg<R extends RouteDef> = R extends { query: infer Q extends z.ZodType } ? { query: z.input<Q> } : { query?: undefined };
export type RouteArgs<R extends RouteDef> = ParamsArg<R> & BodyArg<R> & QueryArg<R>;
export type RouteResponse<R extends RouteDef> = z.output<R['response']>;

export type ApiClient = {
  [K in RouteName as Routes[K] extends { stream: true } ? never : K]: (
    ...args: keyof RouteArgs<Routes[K]> extends never ? [] : [RouteArgs<Routes[K]>] | []
  ) => Promise<RouteResponse<Routes[K]>>;
};

export class ApiClientError extends Error {
  constructor(
    public readonly code: ErrorCode | 'network' | 'contract',
    message: string,
    public readonly status: number,
    public readonly retryable: boolean,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export function buildPath(path: string, params?: Record<string, string>, query?: Record<string, unknown>): string {
  let out = path.replace(/:([A-Za-z]+)/g, (_, name: string) => {
    const v = params?.[name];
    if (v === undefined) throw new Error(`missing path param ${name} for ${path}`);
    return encodeURIComponent(v);
  });
  if (query) {
    const qs = Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    if (qs) out += `?${qs}`;
  }
  return out;
}

export interface ClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  /** validate responses against the contract (default true) */
  validate?: boolean;
  /** extra headers, e.g. X-Role */
  headers?: () => Record<string, string>;
}

export function createApiClient(opts: ClientOptions): ApiClient {
  const doFetch = opts.fetchImpl ?? fetch;
  const base = opts.baseUrl.replace(/\/$/, '');
  const client: Record<string, (args?: { params?: Record<string, string>; body?: unknown; query?: Record<string, unknown> }) => Promise<unknown>> = {};
  for (const [name, def] of Object.entries(routes) as [string, RouteDef][]) {
    if (def.stream) continue;
    client[name] = async (args = {}) => {
      const url = base + buildPath(def.path, args.params, args.query);
      let res: Response;
      try {
        res = await doFetch(url, {
          method: def.method,
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(opts.headers?.() ?? {}) },
          body: def.method === 'GET' ? undefined : JSON.stringify(args.body ?? {}),
        });
      } catch (e) {
        throw new ApiClientError('network', `Cannot reach the server at ${base}. Check EXPO_PUBLIC_API_URL and that the server is running.`, 0, true);
      }
      const text = await res.text();
      let json: unknown = undefined;
      try {
        json = text ? JSON.parse(text) : undefined;
      } catch {
        throw new ApiClientError('contract', `Server returned non-JSON (${res.status})`, res.status, false);
      }
      if (!res.ok) {
        const parsed = ApiErrorBody.safeParse(json);
        if (parsed.success) {
          const e = parsed.data.error;
          throw new ApiClientError(e.code, e.message, res.status, e.retryable, e.request_id);
        }
        throw new ApiClientError('internal', `HTTP ${res.status}`, res.status, res.status >= 500);
      }
      if (opts.validate === false) return json;
      const out = def.response.safeParse(json);
      if (!out.success) {
        throw new ApiClientError('contract', `Response for ${name} did not match the contract: ${out.error.issues[0]?.path.join('.')} ${out.error.issues[0]?.message}`, res.status, false);
      }
      return out.data;
    };
  }
  return client as unknown as ApiClient;
}

/** URL for an SSE route (e.g. memo stream). */
export function streamUrl(baseUrl: string, name: 'memoStream', params: { id: string }): string {
  return baseUrl.replace(/\/$/, '') + buildPath(routes[name].path, params);
}

/** SSE events our server relays to the app (see apps/server/src/http.ts `sse`). */
export const StreamEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('delta'), text: z.string() }),
  z.object({ type: z.literal('done'), finish_reason: z.string(), unverified_sentences: z.array(z.string()) }),
  z.object({ type: z.literal('error'), code: z.string(), message: z.string() }),
]);
export type StreamEvent = z.infer<typeof StreamEvent>;

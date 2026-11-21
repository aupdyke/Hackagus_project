/**
 * `on(router, 'routeName', handler)` registers a route straight from the shared contract:
 * method + path come from `routes[name]`, the body/query are Zod-validated before the handler runs, and the
 * handler's return value is checked against the response schema. Handlers just return data or throw HttpError.
 */
import type { Request, RequestHandler, Response, Router } from 'express';
import type { z } from 'zod';
import { routes, type RouteName, type Routes } from '@falcon/shared';
import { parse, send } from '../http';

type BodyOf<R> = R extends { body: infer B extends z.ZodType } ? z.output<B> : undefined;
type QueryOf<R> = R extends { query: infer Q extends z.ZodType } ? z.output<Q> : undefined;
export type Ctx<K extends RouteName> = {
  params: Record<string, string>;
  body: BodyOf<Routes[K]>;
  query: QueryOf<Routes[K]>;
  req: Request;
  res: Response;
};
type Out<K extends RouteName> = z.input<Routes[K]['response']>;

export function on<K extends RouteName>(router: Router, name: K, handler: (ctx: Ctx<K>) => Promise<Out<K>> | Out<K>, ...middleware: RequestHandler[]): void {
  const def = routes[name] as Routes[K] & { body?: z.ZodType; query?: z.ZodType };
  const method = def.method.toLowerCase() as 'get' | 'post' | 'put';
  router[method](def.path, ...middleware, async (req: Request, res: Response) => {
    const body = def.body ? parse(def.body, req.body ?? {}) : undefined;
    const query = def.query ? parse(def.query, req.query) : undefined;
    const out = await handler({ params: req.params as Record<string, string>, body: body as BodyOf<Routes[K]>, query: query as QueryOf<Routes[K]>, req, res });
    if (!res.headersSent) send(res, def.response, out);
  });
}

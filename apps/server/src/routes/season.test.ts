/** A-15: GET /season returns real numbers; the seeded season is over budget (G10 estimated until it is planned). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SeasonRollup } from '@falcon/shared';
import { call, startTestServer } from '../test/server';

let srv: Awaited<ReturnType<typeof startTestServer>>;
beforeAll(async () => {
  srv = await startTestServer();
});
afterAll(async () => {
  await srv?.close();
});

describe('GET /season', () => {
  it('real roll-up, seeded season over budget, G10 counted at its estimate', async () => {
    const r = await call(srv.url, 'GET', '/season');
    expect(r.status).toBe(200);
    expect(r.headers.get('x-fixture')).toBeNull();
    const s = SeasonRollup.parse(r.json);
    expect(s.budget).toBe(170000);
    expect(s.over_budget).toBe(true);
    expect(s.rows).toHaveLength(6);
    expect(s.rows.find((x) => x.trip_id === 'TRIP-G10')).toMatchObject({ status: 'not_started', counts_toward: 'projected', planned_cost: 26349.58 });
    expect(s.actuals).toMatchObject({ trips_completed: 2, actual_total: 55548.75 });
  });

  it('athletes cannot read the season', async () => {
    expect((await call(srv.url, 'GET', '/season', undefined, { 'x-role': 'athlete', 'x-athlete-id': 'P-001' })).status).toBe(403);
  });
});

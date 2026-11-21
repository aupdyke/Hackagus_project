/** A-12: budget vs actual routes with the seeded G02 actuals; posting actuals completes a published trip. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiErrorBody, BudgetVsActual } from '@falcon/shared';
import { call, startTestServer } from '../test/server';
import { repo } from '../repo';

let srv: Awaited<ReturnType<typeof startTestServer>>;
const get = (p: string) => call(srv.url, 'GET', p);
const post = (p: string, b?: unknown) => call(srv.url, 'POST', p, b);
const ENTRY = { bus: 9000, equipment: 2000, hotel: 9500, meals: 7100, other: 0, notes: 'synthetic' };

beforeAll(async () => {
  srv = await startTestServer();
});
afterAll(async () => {
  await srv?.close();
});

describe('GET /trips/:id/budget-vs-actual', () => {
  it('TRIP-G02 uses the seeded actuals and the selected package plan', async () => {
    const r = await get('/trips/TRIP-G02/budget-vs-actual');
    expect(r.status).toBe(200);
    expect(r.headers.get('x-fixture')).toBeNull();
    const b = BudgetVsActual.parse(r.json);
    const trip = repo.trips.get('TRIP-G02')!;
    const pkg = trip.packages.find((p) => p.option_id === trip.selected_option_id)!;
    expect(b.option_id).toBe('PKG-G02-A');
    expect(b.planned_total).toBe(pkg.costs.total);
    expect(b.actual_total).toBe(26727.45); // 9184.5 + 1205 + 9031.2 + 6894 + 412.75
    expect(b.variance_total).toBe(Math.round((26727.45 - pkg.costs.total) * 100) / 100);
    expect(b.lines.find((l) => l.category === 'bus')).toEqual({ category: 'bus', planned: pkg.costs.bus, actual: 9184.5, variance: Math.round((9184.5 - pkg.costs.bus) * 100) / 100 });
  });

  it('no actuals yet → nulls; no selection → 409', async () => {
    const b = BudgetVsActual.parse((await get('/trips/TRIP-G12/budget-vs-actual')).json);
    expect(b.actual_total).toBeNull();
    expect((await get('/trips/TRIP-G10/budget-vs-actual')).status).toBe(409); // not started, nothing selected
  });
});

describe('POST /trips/:id/actuals', () => {
  it('rejects negative numbers with a 400', async () => {
    const r = await post('/trips/TRIP-G02/actuals', { ...ENTRY, hotel: -1, other: -5 });
    expect(r.status).toBe(400);
    expect(ApiErrorBody.parse(r.json).error.message).toBe("Actual costs can't be negative: hotel, other");
  });

  it('only for published or completed trips', async () => {
    const r = await post('/trips/TRIP-G12/actuals', ENTRY); // draft
    expect(r.status).toBe(409);
    expect(repo.actuals.get('TRIP-G12')).toBeNull();
  });

  it('published → completed, actuals saved and compared', async () => {
    expect((await post('/trips/TRIP-G12/approve')).status).toBe(200);
    expect((await post('/trips/TRIP-G12/publish')).status).toBe(200);
    const r = await post('/trips/TRIP-G12/actuals', ENTRY);
    expect(r.status).toBe(200);
    const b = BudgetVsActual.parse(r.json);
    expect(b.actual_total).toBe(27600);
    expect(repo.trips.get('TRIP-G12')!.status).toBe('completed');
    expect(repo.actuals.get('TRIP-G12')).toMatchObject({ ...ENTRY, trip_id: 'TRIP-G12' });
    // completed trips can be corrected
    const again = BudgetVsActual.parse((await post('/trips/TRIP-G12/actuals', { ...ENTRY, other: 100 })).json);
    expect(again.actual_total).toBe(27700);
  });
});

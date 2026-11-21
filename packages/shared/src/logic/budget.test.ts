import { describe, expect, it } from 'vitest';
import { BudgetVsActual, type ActualsEntry, type Trip } from '../domain';
import * as fx from '../fixtures';
import { budgetVsActual } from './season';

const trip: Trip = { ...fx.FIXTURE_TRIP, packages: fx.FIXTURE_PACKAGES, selected_option_id: 'PKG-G10-A' };
const A = fx.FIXTURE_PACKAGES[0]!; // bus 8676.63, equipment 2040, hotel 7007.13, meals 6674, contingency 1951.82, total 26349.58
const actual: ActualsEntry = { trip_id: trip.trip_id, bus: 9000.1, equipment: 2040, hotel: 6900, meals: 7000.255, other: 125.5, notes: '', entered_at: 'x' };

describe('budgetVsActual', () => {
  it('planned from the selected package; variance = actual − planned (positive = over)', () => {
    const r = budgetVsActual(trip, actual);
    BudgetVsActual.parse(r);
    expect(r.option_id).toBe('PKG-G10-A');
    expect(r.lines).toEqual([
      { category: 'bus', planned: 8676.63, actual: 9000.1, variance: 323.47 },
      { category: 'equipment', planned: 2040, actual: 2040, variance: 0 },
      { category: 'hotel', planned: 7007.13, actual: 6900, variance: -107.13 },
      { category: 'meals', planned: 6674, actual: 7000.26, variance: 326.26 },
      { category: 'other', planned: 0, actual: 125.5, variance: 125.5 },
      { category: 'contingency', planned: 1951.82, actual: null, variance: null },
    ]);
    expect(r.planned_total).toBe(A.costs.total);
    expect(r.actual_total).toBe(25065.86); // 9000.1 + 2040 + 6900 + 7000.255 + 125.5
    expect(r.variance_total).toBe(-1283.72); // under plan (contingency unspent)
  });

  it('no actual entry → actual and variance null', () => {
    const r = budgetVsActual(trip, null);
    expect(r.lines.every((l) => l.actual === null && l.variance === null)).toBe(true);
    expect(r).toMatchObject({ planned_total: 26349.58, actual_total: null, variance_total: null });
  });

  it('follows the selected package', () => {
    const r = budgetVsActual({ ...trip, selected_option_id: 'PKG-G10-C' }, null);
    expect(r.option_id).toBe('PKG-G10-C');
    expect(r.planned_total).toBe(fx.FIXTURE_PACKAGES[2]!.costs.total);
  });

  it('throws a clear error without a selected package or with another trip\'s actuals', () => {
    expect(() => budgetVsActual({ ...trip, selected_option_id: null }, null)).toThrow(/no selected package/);
    expect(() => budgetVsActual(trip, { ...actual, trip_id: 'TRIP-G04' })).toThrow(/do not belong/);
  });
});

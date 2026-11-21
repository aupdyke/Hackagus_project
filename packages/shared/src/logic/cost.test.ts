import { describe, expect, it } from 'vitest';
import { loadDataPack } from '../testing/loadData';
import { FIXTURE_PACKAGES } from '../fixtures';
import type { Settings } from '../domain';
import { computeBusCost, computeCounts, computeHotelCost, computeTotals } from './cost';
import { selectTravelingPlayers, selectTravelingStaff } from './travelers';

const pack = loadDataPack();
const bus = pack.busRates.find((b) => b.company_id === 'BUS-1')!;
const hotel = pack.hotels.find((h) => h.hotel_id === 'H-ATH-1')!;
const settings = pack.settings;
const req = { players: 70, coaches: 12, support_staff: 12, include_equipment_truck: true };
const pkgA = FIXTURE_PACKAGES.find((p) => p.option_id === 'PKG-G10-A')!;

describe('computeCounts', () => {
  it('70/12/12 + truck on BUS-1, overnight → 2 buses, 3 drivers, 35/12/6/3 = 56 rooms', () => {
    const c = computeCounts(req, settings, bus, true);
    expect(c).toEqual({
      players: 70, coaches: 12, support: 12, travelers: 94, drivers: 3, buses: 2, seats_per_bus: 56,
      rooms_players: 35, rooms_coaches: 12, rooms_support: 6, rooms_drivers: 3, rooms_total: 56,
    });
    expect(c).toEqual(pkgA.counts); // matches the contract fixture
  });

  it('seats override 50 → still 2 buses (94 travelers)', () => {
    const s: Settings = { ...settings, seats_per_bus_override: 50 };
    const c = computeCounts(req, s, bus, true);
    expect(c.seats_per_bus).toBe(50);
    expect(c.buses).toBe(2);
  });

  it('113 travelers @56 seats → 3 buses', () => {
    const c = computeCounts({ ...req, players: 89 }, settings, bus, true);
    expect(c.travelers).toBe(113);
    expect(c.buses).toBe(3);
    expect(c.drivers).toBe(4);
  });

  it('exactly full buses do not round up (112 @56 → 2)', () => {
    expect(computeCounts({ ...req, players: 88 }, settings, bus, true).buses).toBe(2);
  });

  it('not overnight → 0 driver rooms', () => {
    const c = computeCounts(req, settings, bus, false);
    expect(c.rooms_drivers).toBe(0);
    expect(c.rooms_total).toBe(35 + 12 + 6);
  });

  it('bus company without driver-room requirement → 0 driver rooms', () => {
    const c = computeCounts(req, settings, { ...bus, driver_room_required_overnight: false }, true);
    expect(c.rooms_drivers).toBe(0);
  });

  it('no truck → drivers = buses', () => {
    const c = computeCounts({ ...req, include_equipment_truck: false }, settings, bus, true);
    expect(c.drivers).toBe(2);
    expect(c.rooms_drivers).toBe(2);
  });

  it('player occupancy 4 → 18 player rooms', () => {
    const c = computeCounts(req, { ...settings, player_room_occupancy: 4 }, bus, true);
    expect(c.rooms_players).toBe(18);
  });

  it('always at least one bus', () => {
    const c = computeCounts({ players: 1, coaches: 0, support_staff: 0, include_equipment_truck: false }, settings, bus, false);
    expect(c.buses).toBe(1);
  });
});

describe('computeBusCost / computeHotelCost / computeTotals', () => {
  const counts = computeCounts(req, settings, bus, true);

  it('bus cost incl. driver rooms at H-ATH-1 → 8676.63; equipment → 2040', () => {
    expect(computeBusCost(counts, bus, hotel, 2, 1, 400, true)).toEqual({ bus: 8676.63, equipment: 2040 });
  });

  it('no truck → equipment 0', () => {
    expect(computeBusCost(counts, bus, hotel, 2, 1, 400, false).equipment).toBe(0);
  });

  it('hotel null → no driver-room cost', () => {
    expect(computeBusCost(counts, bus, null, 2, 1, 400, true).bus).toBe(8280);
  });

  it('hotel excludes driver rooms → 7007.13', () => {
    expect(computeHotelCost(counts, hotel, 1)).toBe(7007.13);
  });

  it('nights 0 → hotel 0 and no driver-room cost', () => {
    expect(computeHotelCost(counts, hotel, 0)).toBe(0);
    expect(computeBusCost(counts, bus, hotel, 1, 0, 400, false).bus).toBe(2 * (1450 + 3.1 * 400));
  });

  it('totals with meals 6674 at 8% → 24397.76 / 1951.82 / 26349.58 (matches fixture package A)', () => {
    const t = computeTotals({ bus: 8676.63, equipment: 2040, hotel: 7007.13, meals: 6674 }, settings.contingency_pct);
    expect(t).toEqual({ bus: 8676.63, equipment: 2040, hotel: 7007.13, meals: 6674, subtotal: 24397.76, contingency: 1951.82, total: 26349.58 });
    expect(t).toEqual(pkgA.costs);
  });

  it('end to end from primitives reproduces package A costs', () => {
    const { bus: b, equipment } = computeBusCost(counts, bus, hotel, 2, 1, 400, true);
    const t = computeTotals({ bus: b, equipment, hotel: computeHotelCost(counts, hotel, 1), meals: 6674 }, 8);
    expect(t).toEqual(pkgA.costs);
  });

  it('rounds every output to cents', () => {
    const t = computeTotals({ bus: 0.005, equipment: 1.004, hotel: 1 / 3, meals: 0 }, 7);
    for (const v of Object.values(t)) expect(Math.round(v * 100) / 100).toBe(v);
  });
});

describe('selectTravelingPlayers / selectTravelingStaff', () => {
  it('70 → 70 eligible players in priority order', () => {
    const sel = selectTravelingPlayers(pack.roster, 70);
    expect(sel).toHaveLength(70);
    expect(sel.every((p) => p.travel_eligible)).toBe(true);
    const pr = sel.map((p) => p.travel_priority);
    expect(pr).toEqual([...pr].sort((a, b) => a - b));
    const eligible = pack.roster.filter((p) => p.travel_eligible).map((p) => p.travel_priority).sort((a, b) => a - b);
    expect(pr).toEqual(eligible.slice(0, 70));
  });

  it('asking for 99 returns only the eligible ones (96)', () => {
    const sel = selectTravelingPlayers(pack.roster, 99);
    expect(sel).toHaveLength(96);
    expect(sel.every((p) => p.travel_eligible)).toBe(true);
  });

  it('does not mutate the roster', () => {
    const before = pack.roster.map((p) => p.id);
    selectTravelingPlayers(pack.roster, 50);
    expect(pack.roster.map((p) => p.id)).toEqual(before);
  });

  it('staff 12/12 picks travels_by_default first, per category', () => {
    const sel = selectTravelingStaff(pack.staff, 12, 12);
    const coaches = sel.filter((s) => s.category === 'coach');
    const support = sel.filter((s) => s.category === 'support');
    expect(coaches).toHaveLength(12);
    expect(support).toHaveLength(12);
    expect(sel.every((s) => s.travels_by_default)).toBe(true);
  });

  it('staff beyond the defaults fills by id; 0 → none', () => {
    const support = selectTravelingStaff(pack.staff, 0, 14);
    expect(support).toHaveLength(14);
    expect(support.slice(0, 12).every((s) => s.travels_by_default)).toBe(true);
    const extras = support.slice(12).map((s) => s.id);
    expect(extras).toEqual([...extras].sort());
    expect(selectTravelingStaff(pack.staff, 0, 0)).toEqual([]);
  });
});

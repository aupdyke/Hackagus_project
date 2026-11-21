import { describe, expect, it } from 'vitest';
import { AthleteTripView, ChangeItem } from '../domain';
import * as fx from '../fixtures';
import { ROSTER_ITEM_ID, describeChanges, diffAthleteViews } from './athlete';

const v1: AthleteTripView = structuredClone(fx.FIXTURE_ATHLETE_VIEW);
const clone = () => structuredClone(v1);

describe('diffAthleteViews', () => {
  it('first publish (no previous view) → no changes; identical views → no changes', () => {
    expect(diffAthleteViews(null, v1)).toEqual([]);
    expect(diffAthleteViews(v1, clone())).toEqual([]);
  });

  it('time change on an itinerary item', () => {
    const v2 = clone();
    v2.itinerary[0] = { ...v2.itinerary[0]!, start_local: '2026-11-27T12:00' };
    expect(diffAthleteViews(v1, v2)).toEqual([
      { kind: 'time', item_id: 'IT-1', label: 'Buses depart', before: 'Fri Nov 27, 11:00 AM', after: 'Fri Nov 27, 12:00 PM' },
    ]);
  });

  it('roommate change', () => {
    const v2 = clone();
    v2.roommates = [{ id: 'P-020', name: 'Jory Kettering' }];
    const [c] = diffAthleteViews({ ...v1, roommates: [{ id: 'P-010', name: 'Nico Redfern' }] }, v2);
    expect(c).toEqual({ kind: 'roommate', item_id: 'RM-01', label: 'Roommate', before: 'Nico Redfern', after: 'Jory Kettering' });
  });

  it('added and removed items are matched by kind + label, not id', () => {
    const v2 = clone();
    // drop "Position meetings" (IT-7) and renumber the rest — only one removal must be reported
    v2.itinerary = v2.itinerary.filter((i) => i.kind !== 'meeting').map((i, n) => ({ ...i, id: `IT-${n + 1}` }));
    v2.itinerary.push({ id: 'IT-99', kind: 'stop', label: 'Rest stop', start_local: '2026-11-28T18:00', end_local: '2026-11-28T18:20', location: 'En route', meal_id: '' });
    const changes = diffAthleteViews(v1, v2);
    expect(changes).toEqual([
      { kind: 'added', item_id: 'IT-99', label: 'Rest stop', before: '', after: 'Sat Nov 28, 6:00 PM' },
      { kind: 'removed', item_id: 'IT-7', label: 'Position meetings', before: 'Fri Nov 27, 8:00 PM', after: '' },
    ]);
  });

  it('hotel, bus and meal vendor changes', () => {
    const v2 = clone();
    v2.hotel = { ...v2.hotel, hotel_id: 'H-ATH-3', name: 'Kestrel Lodge Athens (synthetic)' };
    v2.bus_number = 1;
    v2.meals[1] = { ...v2.meals[1]!, vendor_name: 'Hotel team meal' };
    const kinds = diffAthleteViews(v1, v2).map((c) => [c.kind, c.before, c.after]);
    expect(kinds).toEqual([
      ['hotel', v1.hotel.name, 'Kestrel Lodge Athens (synthetic)'],
      ['bus', 'Bus 2', 'Bus 1'],
      ['meal', v1.meals[1]!.vendor_name, 'Hotel team meal'],
    ]);
  });
});

describe('describeChanges', () => {
  it('no changes → published title with departure, bus and room', () => {
    const d = describeChanges([], 'Ohio', v1);
    expect(d.title).toBe('Your Ohio trip is published');
    expect(d.body).toBe("Buses depart Fri Nov 27 at 11:00 AM. You're on Bus 2. Room RM-01 with Teammate P-010. Hotel: Bluestem Lodge Athens (synthetic).");
  });

  it('departure + roommate sentences in plain words', () => {
    const changes: ChangeItem[] = [
      { kind: 'time', item_id: 'IT-1', label: 'Buses depart', before: 'Fri Nov 27, 11:00 AM', after: 'Fri Nov 27, 12:00 PM' },
      { kind: 'roommate', item_id: 'RM-01', label: 'Roommate', before: 'Nico Redfern', after: 'Jory Kettering' },
    ];
    for (const c of changes) ChangeItem.parse(c);
    const d = describeChanges(changes, 'Ohio');
    expect(d.title).toBe('Ohio trip updated: departure time changed (+1 more)');
    expect(d.body).toBe('Buses now depart Fri Nov 27 at 12:00 PM (was 11:00 AM). Your roommate is now Jory Kettering (was Nico Redfern).');
  });

  it('other kinds', () => {
    const d = describeChanges([
      { kind: 'time', item_id: 'IT-6', label: 'Team dinner', before: 'Fri Nov 27, 6:30 PM', after: 'Sat Nov 28, 8:00 AM' },
      { kind: 'bus', item_id: 'bus', label: 'Bus', before: 'Bus 2', after: 'Bus 1' },
      { kind: 'removed', item_id: ROSTER_ITEM_ID, label: 'You are no longer on the travel roster for Ohio', before: 'On the travel roster', after: '' },
    ], 'Ohio');
    expect(d.body).toBe("Team dinner is now Sat Nov 28 at 8:00 AM (was Fri Nov 27 at 6:30 PM). You're now on Bus 1 (was Bus 2). You are no longer on the travel roster for Ohio.");
    expect(describeChanges([{ kind: 'removed', item_id: ROSTER_ITEM_ID, label: 'x', before: '', after: '' }], 'Ohio').title)
      .toBe('Ohio trip updated: you are no longer on the travel roster');
  });
});

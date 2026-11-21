/**
 * Athlete-scoped views — tasks A-13 (view + diff) and A-14 (fact sheet).
 *  - buildAthleteView: one athlete's slice of a published trip (no other athletes' details beyond roommate names)
 *  - diffAthleteViews: typed changes between two published versions for one athlete
 *  - describeChanges: plain-language title/body from the diff (code, not AI)
 *  - buildFactSheet: compact facts with ids for the assistant (itinerary ids IT-n reused; F-* for the rest)
 */
import type { AthleteTripView, ChangeItem, Fact, Game, Hotel, ItineraryItem, Player, Settings, Trip } from '../domain';
import type { PlanningData } from './types';
import { addDays, formatDayTime } from './time';
import { emptyFacts, factsFromText, mergeFacts, type AllowedFacts } from './factGuard';

const MEAL_NAME: Record<string, string> = {
  en_route_lunch: 'En-route lunch', team_dinner: 'Team dinner', breakfast: 'Breakfast', pregame_meal: 'Pre-game meal', postgame_boxed: 'Post-game boxed meal',
};
/** Change item id used when an athlete is dropped from the travel roster. */
export const ROSTER_ITEM_ID = 'roster';

function personName(id: string, data: Pick<PlanningData, 'roster' | 'staff'>): string {
  const p = data.roster.find((x) => x.id === id) ?? data.staff.find((x) => x.id === id);
  return p ? `${p.first_name} ${p.last_name}` : id;
}

/**
 * One athlete's slice of a (published) trip: the selected package's itinerary and meals, THEIR bus and room,
 * roommate names only. `hotel` is null for same-day trips.
 */
export function buildAthleteView(trip: Trip, game: Game, hotel: Hotel | null, athlete: Player, data: PlanningData, settings: Settings, shareUrl: string): AthleteTripView {
  const pkg = trip.packages.find((p) => p.option_id === trip.selected_option_id);
  if (!pkg) throw new Error(`Trip ${trip.trip_id} has no selected package`);
  const bus = trip.buses.find((b) => b.traveler_ids.includes(athlete.id)) ?? null;
  const room = trip.rooming?.rooms.find((r) => r.occupant_ids.includes(athlete.id)) ?? null;
  return {
    trip_id: trip.trip_id,
    version: trip.published_version,
    athlete_id: athlete.id,
    game,
    hotel: hotel ? { hotel_id: hotel.hotel_id, name: hotel.name, address: hotel.address, phone: hotel.phone } : { hotel_id: '', name: '', address: '', phone: '' },
    bus_number: bus?.bus_number ?? null,
    room_id: room?.room_id ?? null,
    roommates: (room?.occupant_ids ?? []).filter((id) => id !== athlete.id).map((id) => ({ id, name: personName(id, data) })),
    itinerary: pkg.itinerary,
    meals: pkg.meals.map((m) => ({ meal_id: m.meal_id, kind: m.kind, time_local: m.time_local, vendor_name: m.vendor_name, itinerary_item_id: m.itinerary_item_id })),
    packing_list: settings.packing_list,
    departure_local: pkg.departure_local,
    roommate_deadline_local: trip.roommate_deadline_local,
    published_at: trip.published_at,
    share_url: shareUrl,
  };
}

/** Itinerary items keyed by kind + label (+ occurrence), because ids shift when items are added/removed. */
function keyed(items: ItineraryItem[]): Map<string, ItineraryItem> {
  const seen = new Map<string, number>();
  const out = new Map<string, ItineraryItem>();
  for (const i of items) {
    const base = `${i.kind}|${i.label}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.set(`${base}|${n}`, i);
  }
  return out;
}
const names = (rs: AthleteTripView['roommates']) => [...rs].sort((a, b) => (a.id < b.id ? -1 : 1)).map((r) => r.name).join(', ');
const busText = (n: number | null) => (n === null ? 'Not assigned' : `Bus ${n}`);

/**
 * Typed changes for ONE athlete between two published views. before null (first publish / newly added) → [].
 * Itinerary time changes, added/removed items, hotel, bus, roommates, and meal vendor changes (a meal's time change
 * is already reported by its itinerary item).
 */
export function diffAthleteViews(before: AthleteTripView | null, after: AthleteTripView): ChangeItem[] {
  if (!before) return [];
  const changes: ChangeItem[] = [];
  const b = keyed(before.itinerary);
  const a = keyed(after.itinerary);
  for (const [k, item] of a) {
    const old = b.get(k);
    if (!old) changes.push({ kind: 'added', item_id: item.id, label: item.label, before: '', after: formatDayTime(item.start_local) });
    else if (old.start_local !== item.start_local) changes.push({ kind: 'time', item_id: item.id, label: item.label, before: formatDayTime(old.start_local), after: formatDayTime(item.start_local) });
  }
  for (const [k, item] of b) {
    if (!a.has(k)) changes.push({ kind: 'removed', item_id: item.id, label: item.label, before: formatDayTime(item.start_local), after: '' });
  }
  if (before.hotel.name !== after.hotel.name) changes.push({ kind: 'hotel', item_id: after.hotel.hotel_id, label: 'Hotel', before: before.hotel.name, after: after.hotel.name });
  if (before.bus_number !== after.bus_number) changes.push({ kind: 'bus', item_id: 'bus', label: 'Bus', before: busText(before.bus_number), after: busText(after.bus_number) });
  if (names(before.roommates) !== names(after.roommates)) {
    changes.push({ kind: 'roommate', item_id: after.room_id ?? '', label: 'Roommate', before: names(before.roommates), after: names(after.roommates) });
  }
  const mealKey = (m: AthleteTripView['meals'][number], i: number, all: AthleteTripView['meals']) => `${m.kind}|${all.slice(0, i).filter((x) => x.kind === m.kind).length}`;
  const bm = new Map(before.meals.map((m, i, all) => [mealKey(m, i, all), m]));
  after.meals.forEach((m, i, all) => {
    const old = bm.get(mealKey(m, i, all));
    if (old && old.vendor_name !== m.vendor_name) {
      changes.push({ kind: 'meal', item_id: m.itinerary_item_id, label: MEAL_NAME[m.kind] ?? m.kind, before: old.vendor_name, after: m.vendor_name });
    }
  });
  return changes;
}

/** "Fri Nov 27, 12:00 PM" → "Fri Nov 27 at 12:00 PM" */
const at = (dayTime: string) => dayTime.replace(', ', ' at ');
/** Previous value, shortened to the clock when it's the same day as the new one. */
const was = (before: string, after: string) => {
  const [bd, bt] = before.split(', ');
  const [ad] = after.split(', ');
  return bd === ad && bt ? bt : at(before);
};

function summary(c: ChangeItem): string {
  switch (c.kind) {
    case 'time': return c.label === 'Buses depart' ? 'departure time changed' : `${c.label} time changed`;
    case 'hotel': return 'new hotel';
    case 'bus': return 'new bus';
    case 'roommate': return 'roommate change';
    case 'meal': return `${c.label} change`;
    case 'added': return `${c.label} added`;
    case 'removed': return c.item_id === ROSTER_ITEM_ID ? 'you are no longer on the travel roster' : `${c.label} removed`;
  }
}

function sentence(c: ChangeItem): string {
  switch (c.kind) {
    case 'time':
      return c.label === 'Buses depart'
        ? `Buses now depart ${at(c.after)} (was ${was(c.before, c.after)}).`
        : `${c.label} is now ${at(c.after)} (was ${was(c.before, c.after)}).`;
    case 'hotel': return `Your hotel is now ${c.after} (was ${c.before}).`;
    case 'bus': return `You're now on ${c.after} (was ${c.before}).`;
    case 'roommate':
      if (!c.after) return `You no longer have a roommate listed (was ${c.before}).`;
      if (!c.before) return `Your roommate is now ${c.after}.`;
      return `Your roommate${c.after.includes(', ') ? 's are' : ' is'} now ${c.after} (was ${c.before}).`;
    case 'meal': return `${c.label} is now at ${c.after} (was ${c.before}).`;
    case 'added': return `New: ${c.label} on ${at(c.after)}.`;
    case 'removed': return c.item_id === ROSTER_ITEM_ID ? `${c.label}.` : `${c.label} (${at(c.before)}) is no longer on the schedule.`;
  }
}

/**
 * Plain-language notification text from the diff (code, not AI).
 * No changes → "Your <opponent> trip is published" + a summary of departure, bus and room (pass `view`).
 */
export function describeChanges(changes: ChangeItem[], opponent: string, view?: AthleteTripView): { title: string; body: string } {
  if (!changes.length) {
    const parts: string[] = [];
    if (view) {
      parts.push(`Buses depart ${at(formatDayTime(view.departure_local))}.`);
      parts.push(view.bus_number === null ? 'Your bus will be assigned soon.' : `You're on Bus ${view.bus_number}.`);
      if (view.room_id) parts.push(`Room ${view.room_id}${view.roommates.length ? ` with ${view.roommates.map((r) => r.name).join(' and ')}` : ''}.`);
      if (view.hotel.name) parts.push(`Hotel: ${view.hotel.name}.`);
    }
    return { title: `Your ${opponent} trip is published`, body: parts.join(' ') || 'Open the app for your itinerary.' };
  }
  const more = changes.length > 1 ? ` (+${changes.length - 1} more)` : '';
  return { title: `${opponent} trip updated: ${summary(changes[0]!)}${more}`, body: changes.map(sentence).join(' ') };
}

/** Fact text must stay plain (no quotes/backslashes) so the compact JSON list is easy to read and cite. */
const plain = (s: string) => s.replace(/["\\]/g, "'");

/**
 * Compact fact sheet for the athlete assistant (A-14). Only THIS athlete's slice; itinerary ids IT-n reused, F-* for
 * the rest. Order matters a little (personal facts first): F-opponent, F-bus, F-room, F-hotel, IT-n…, F-meal-ML-n…,
 * F-packing, F-deadline.
 */
export function buildFactSheet(view: AthleteTripView): Fact[] {
  const g = view.game;
  const facts: Fact[] = [];
  const add = (id: string, text: string) => facts.push({ id, text: plain(text) });
  add('F-opponent', `Game vs ${g.opponent} at ${g.stadium_name}, ${g.city}, ${g.state} — kickoff ${formatDayTime(`${g.date}T${g.kickoff_local}`)}`);
  add('F-bus', view.bus_number === null ? 'Your bus has not been assigned yet' : `Your bus: Bus ${view.bus_number}`);
  add('F-room', !view.room_id
    ? 'Your room has not been assigned yet'
    : view.roommates.length ? `Your room ${view.room_id} with ${view.roommates.map((r) => r.name).join(' and ')}` : `Your room ${view.room_id} (no roommate listed)`);
  if (view.hotel.name) add('F-hotel', `Hotel: ${view.hotel.name}, ${view.hotel.address}, phone ${view.hotel.phone}`);
  for (const i of view.itinerary) add(i.id, `${i.label} — ${formatDayTime(i.start_local)}${i.location ? ` — ${i.location}` : ''}`);
  for (const m of view.meals) add(`F-meal-${m.meal_id}`, `${MEAL_NAME[m.kind] ?? m.kind} — ${formatDayTime(m.time_local)} — ${m.vendor_name}`);
  if (view.packing_list.length) add('F-packing', `Packing list: ${view.packing_list.join('; ')}`);
  if (view.roommate_deadline_local) add('F-deadline', `Roommate request deadline: ${formatDayTime(view.roommate_deadline_local)}`);
  return facts;
}

/**
 * Allowed facts for checking an assistant answer: fact ids, every date/time in the view, the game week (so weekday
 * words in code-written facts like the packing list are OK), and numbers quoted in the fact texts.
 */
export function factSheetAllowed(view: AthleteTripView, facts: Fact[]): AllowedFacts {
  const f = emptyFacts();
  f.ids = facts.map((x) => x.id);
  const stamp = (ldt: string) => {
    if (!ldt) return;
    f.dates.push(ldt.slice(0, 10));
    if (ldt.length >= 16) f.times.push(ldt.slice(11, 16));
  };
  stamp(`${view.game.date}T${view.game.kickoff_local}`);
  for (const i of view.itinerary) { stamp(i.start_local); stamp(i.end_local); }
  for (const m of view.meals) stamp(m.time_local);
  stamp(view.departure_local);
  stamp(view.roommate_deadline_local);
  for (let d = 1; d <= 6; d++) f.dates.push(addDays(view.game.date, -d));
  return mergeFacts(f, factsFromText(facts.map((x) => x.text).join('\n')));
}

/**
 * Travel packets (task A-11): one HTML renderer for the staff packet, the athlete packet and the public share page.
 * Self-contained, printable (expo-print → PDF), mobile viewport, BGSU colors. Every string from data is escaped.
 *   staff   — itinerary, bus manifest, rooming, meals (+ headcount, dietary notes), key contacts, cost summary (Estimate)
 *   athlete — itinerary, THEIR bus + room + roommates only, meals, hotel, key contacts, packing list. No costs.
 *   public  — itinerary, hotel, meals, contacts by role, packing list. No names, no costs.
 */
import { ESTIMATE_LABEL, formatClock, formatDate, formatDayTime, formatUSD, type Dietary, type Game, type TravelPackage, type Trip } from '@falcon/shared';
import { hotelById, pack, playerName, staffById } from '../data';
import { repo } from '../repo';

export type PacketAudience = 'staff' | 'athlete' | 'public';
export const PACKET_FOOTER = 'Synthetic data — 2026 BGSU Hackathon. Costs are estimates.';

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const DIET: Record<Dietary, string> = { none: 'standard', vegetarian: 'vegetarian', gluten_free: 'gluten-free', nut_allergy: 'nut allergy' };
const MEAL_NAME: Record<string, string> = {
  en_route_lunch: 'En-route lunch', team_dinner: 'Team dinner', breakfast: 'Breakfast', pregame_meal: 'Pre-game meal', postgame_boxed: 'Post-game boxed meal',
};

/** Display name for any traveler id (players, staff, DRIVER-n). */
export function personName(id: string): string {
  const d = /^DRIVER-(\d+)$/.exec(id);
  if (d) return `Driver ${d[1]}`;
  const s = staffById(id);
  if (s) return `${s.first_name} ${s.last_name}`;
  return playerName(id);
}

const STYLE = `
  :root { --orange: #FE5000; --brown: #4F2C1D; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #222; margin: 16px; line-height: 1.4; }
  header { border-bottom: 4px solid var(--orange); padding-bottom: 8px; margin-bottom: 12px; }
  h1 { color: var(--brown); font-size: 22px; margin: 0 0 4px; }
  h2 { color: var(--brown); font-size: 16px; margin: 18px 0 6px; border-left: 4px solid var(--orange); padding-left: 6px; }
  .sub { color: #555; margin: 0; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; page-break-inside: avoid; }
  th, td { text-align: left; padding: 4px 6px; border-bottom: 1px solid #e5e5e5; vertical-align: top; }
  th { background: #fdf1ea; color: var(--brown); }
  td.num { text-align: right; white-space: nowrap; }
  .badge { display: inline-block; background: var(--orange); color: #fff; font-size: 11px; border-radius: 4px; padding: 0 5px; margin-left: 4px; }
  .note { color: #8a3b00; }
  ul { margin: 4px 0; padding-left: 20px; }
  footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #ddd; color: #666; font-size: 12px; }
  section { page-break-inside: avoid; }
  @page { margin: 14mm; }
  @media print { body { margin: 0; } }
`;

const table = (head: string[], rows: string[][], numCols: number[] = []) =>
  `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c, i) => `<td${numCols.includes(i) ? ' class="num"' : ''}>${c}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;
const section = (title: string, body: string) => `<section><h2>${esc(title)}</h2>${body}</section>`;
const when = (start: string, end: string) => esc(end ? `${formatDayTime(start)} – ${formatClock(end)}` : formatDayTime(start));

export interface PacketInput {
  trip: Trip;
  game: Game;
  pkg: TravelPackage;
  audience: PacketAudience;
  /** required for athlete packets (must be on the traveling roster — the route checks) */
  athleteId?: string;
}

export function packetTitle(game: Game, audience: PacketAudience): string {
  const what = audience === 'staff' ? 'Staff travel packet' : audience === 'athlete' ? 'Athlete travel packet' : 'Trip itinerary';
  return `${what} — BGSU Falcons at ${game.opponent}`;
}

export function renderPacketHtml({ trip, game, pkg, audience, athleteId }: PacketInput): { title: string; html: string } {
  const title = packetTitle(game, audience);
  const hotel = hotelById(pkg.hotel_id) ?? null;
  const busCo = pack.busRates.find((b) => b.company_id === pkg.bus_company_id) ?? null;
  const settings = repo.settings.get();
  const parts: string[] = [];

  // Header
  parts.push(`<header><h1>${esc(`BGSU Falcons at ${game.opponent}`)}</h1>
<p class="sub">${esc(formatDate(game.date))} · Kickoff ${esc(formatClock(game.kickoff_local))} · ${esc(game.stadium_name)}, ${esc(`${game.city}, ${game.state}`)}</p>
<p class="sub">${esc(title)} · Option ${esc(pkg.option_id)} (${esc(pkg.label)})${trip.published_version ? ` · Version ${esc(trip.published_version)}` : ''}</p></header>`);

  // Athlete: their bus + room first (what they look for)
  if (audience === 'athlete' && athleteId) {
    const bus = trip.buses.find((b) => b.traveler_ids.includes(athleteId));
    const room = trip.rooming?.rooms.find((r) => r.occupant_ids.includes(athleteId));
    const mates = room ? room.occupant_ids.filter((id) => id !== athleteId).map(personName) : [];
    parts.push(section(`Your trip, ${personName(athleteId)}`, `<ul>
<li><strong>Bus:</strong> ${bus ? `Bus ${esc(bus.bus_number)}` : 'Assigned before departure'}</li>
<li><strong>Room:</strong> ${room ? esc(room.room_id) : 'Assigned before departure'}${mates.length ? ` with ${esc(mates.join(' and '))}` : ''}</li>
</ul>`));
  }

  // Itinerary (all audiences)
  parts.push(section('Itinerary', table(['When', 'What', 'Where'], pkg.itinerary.map((i) => [when(i.start_local, i.end_local), esc(i.label), esc(i.location)]))));

  // Hotel
  if (hotel) {
    parts.push(section('Hotel', `<p><strong>${esc(hotel.name)}</strong><br>${esc(hotel.address)}<br>${esc(hotel.phone)}</p>`));
  }

  // Meals
  const mealRows = pkg.meals.map((m) => {
    const row = [esc(formatDayTime(m.time_local)), esc(MEAL_NAME[m.kind] ?? m.kind), esc(m.vendor_name)];
    if (audience === 'staff') {
      row.push(esc(m.headcount));
      row.push(m.dietary_gaps.length ? `<span class="note">No ${esc(m.dietary_gaps.map((d) => DIET[d]).join(', '))} option — arrange alternatives</span>` : 'All diets covered');
    }
    return row;
  });
  parts.push(section('Meals', table(audience === 'staff' ? ['When', 'Meal', 'Vendor', 'Headcount', 'Dietary notes'] : ['When', 'Meal', 'Vendor'], mealRows, audience === 'staff' ? [3] : [])));

  // Staff-only: bus manifest + rooming
  if (audience === 'staff') {
    parts.push(section('Bus manifest', trip.buses.length
      ? table(['Bus', 'Travelers'], trip.buses.map((b) => [esc(`Bus ${b.bus_number} (${b.traveler_ids.length})`), esc(b.traveler_ids.map(personName).join(', '))]))
      : '<p>Not generated yet — generate rooming to build the manifest.</p>'));
    parts.push(section('Rooming list', trip.rooming
      ? table(['Room', 'Type', 'Occupants'], trip.rooming.rooms.map((r) => [esc(r.room_id), esc(r.kind), esc(r.occupant_ids.map(personName).join(', '))]))
      : '<p>Not generated yet.</p>'));
  }

  // Key contacts (public: role + phone only, no names)
  const contacts = pack.staff.filter((s) => s.key_contact).map((s) =>
    audience === 'public' ? [esc(s.role), esc(s.phone)] : [esc(`${s.first_name} ${s.last_name}`), esc(s.role), esc(s.phone)]);
  if (hotel) contacts.push(audience === 'public' ? [esc(`Hotel — ${hotel.name}`), esc(hotel.phone)] : [esc(hotel.name), 'Hotel', esc(hotel.phone)]);
  if (busCo) contacts.push(audience === 'public' ? [esc(`Bus company — ${busCo.name}`), esc(busCo.phone)] : [esc(busCo.name), 'Bus company', esc(busCo.phone)]);
  parts.push(section('Key contacts', table(audience === 'public' ? ['Contact', 'Phone'] : ['Name', 'Role', 'Phone'], contacts)));

  // Packing list (athlete + public)
  if (audience !== 'staff' && settings.packing_list.length) {
    parts.push(section('Packing list', `<ul>${settings.packing_list.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`));
  }

  // Staff-only: costs, each labeled Estimate
  if (audience === 'staff') {
    const c = pkg.costs;
    const badge = `<span class="badge">${esc(ESTIMATE_LABEL)}</span>`;
    const rows: [string, number][] = [['Bus', c.bus], ['Equipment truck', c.equipment], ['Hotel', c.hotel], ['Meals', c.meals], ['Subtotal', c.subtotal], [`Contingency (${settings.contingency_pct}%)`, c.contingency], ['Total', c.total]];
    parts.push(section('Cost summary', table(['Item', `Amount (${ESTIMATE_LABEL})`], rows.map(([k, v]) => [esc(k), `${esc(formatUSD(v, { cents: true }))} ${badge}`]), [1])));
    if (pkg.risk_flags.length) {
      parts.push(section('Risk flags', `<ul>${pkg.risk_flags.map((f) => `<li><strong>${esc(f.severity)}</strong>: ${esc(f.message)}</li>`).join('')}</ul>`));
    }
  }

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${STYLE}</style></head>
<body>${parts.join('\n')}
<footer>${esc(PACKET_FOOTER)}</footer></body></html>`;
  return { title, html };
}

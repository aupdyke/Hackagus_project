/** A-11: staff / athlete packets, role scoping, escaping, public share page. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ESTIMATE_LABEL, Packet, formatUSD } from '@falcon/shared';
import { call, startTestServer } from '../test/server';
import { repo } from '../repo';
import { pack } from '../data';
import { PACKET_FOOTER, esc, personName } from './packet';

let srv: Awaited<ReturnType<typeof startTestServer>>;
const get = (p: string, h?: Record<string, string>) => call(srv.url, 'GET', p, undefined, h);
const post = (p: string) => call(srv.url, 'POST', p);
const TRIP = 'TRIP-G12';

beforeAll(async () => {
  srv = await startTestServer();
  expect((await post(`/trips/${TRIP}/rooming/generate`)).status).toBe(200); // fills buses + rooming
});
afterAll(async () => {
  await srv?.close();
});

const trip = () => repo.trips.get(TRIP)!;
const selected = () => trip().packages.find((p) => p.option_id === trip().selected_option_id)!;
const roomOf = (id: string) => trip().rooming!.rooms.find((r) => r.occupant_ids.includes(id))!;
const packet = async (q: string, h?: Record<string, string>) => {
  const r = await get(`/trips/${TRIP}/packet?${q}`, h);
  return { status: r.status, packet: r.status === 200 ? Packet.parse(r.json) : null, json: r.json };
};

describe('staff packet', () => {
  it('has every section, Estimate labels and the total', async () => {
    const { status, packet: p } = await packet('audience=staff');
    expect(status).toBe(200);
    expect(p!.title).toBe('Staff travel packet — BGSU Falcons at Buffalo');
    const html = p!.html;
    for (const h of ['Itinerary', 'Bus manifest', 'Rooming list', 'Meals', 'Key contacts', 'Cost summary']) expect(html).toContain(`<h2>${h}</h2>`);
    expect(html).toContain(ESTIMATE_LABEL);
    expect(html).toContain(formatUSD(selected().costs.total, { cents: true }));
    expect(html).toContain(PACKET_FOOTER);
    expect(html).toMatch(/@page \{ margin: 14mm; \}/);
    expect(html).toMatch(/page-break-inside: avoid/);
    expect(html).toContain('name="viewport"');
    expect(html).toContain('#FE5000');
    expect(html).toContain(esc(personName(trip().traveling_player_ids[5]!))); // manifest lists names
    expect(p!.share_url).toBe(''); // not published yet
  });
});

describe('athlete packet', () => {
  it('shows their bus, room and roommate — no costs, no other athletes', async () => {
    const me = trip().traveling_player_ids[0]!;
    const room = roomOf(me);
    const mate = room.occupant_ids.find((id) => id !== me)!;
    const stranger = trip().traveling_player_ids.find((id) => !room.occupant_ids.includes(id))!;
    const { status, packet: p } = await packet(`audience=athlete&athleteId=${me}`);
    expect(status).toBe(200);
    const html = p!.html;
    expect(html).not.toContain('$');
    expect(html).toContain(esc(personName(mate)));
    expect(html).not.toContain(esc(personName(stranger)));
    expect(html).toContain(`<strong>Room:</strong> ${room.room_id}`);
    const bus = trip().buses.find((b) => b.traveler_ids.includes(me))!;
    expect(html).toContain(`Bus ${bus.bus_number}`);
    expect(html).toContain('<h2>Packing list</h2>');
    expect(html).not.toContain('Cost summary');
  });

  it('escapes names from data', async () => {
    const me = trip().traveling_player_ids[0]!;
    const mate = roomOf(me).occupant_ids.find((id) => id !== me)!;
    const player = pack.roster.find((x) => x.id === mate)!;
    const original = player.first_name;
    player.first_name = '<script>alert("x")</script>';
    try {
      const { packet: p } = await packet(`audience=athlete&athleteId=${me}`);
      expect(p!.html).not.toContain('<script>alert');
      expect(p!.html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    } finally {
      player.first_name = original;
    }
  });

  it('athleteId required and must be on the roster', async () => {
    expect((await packet('audience=athlete')).status).toBe(400);
    const benched = pack.roster.find((p) => !trip().traveling_player_ids.includes(p.id))!.id;
    expect((await packet(`audience=athlete&athleteId=${benched}`)).status).toBe(404);
  });

  it('athlete role: only their own athlete packet', async () => {
    const me = trip().traveling_player_ids[0]!;
    const other = trip().traveling_player_ids[1]!;
    const as = { 'x-role': 'athlete', 'x-athlete-id': me };
    expect((await packet(`audience=athlete&athleteId=${me}`, as)).status).toBe(200);
    expect((await packet(`audience=athlete&athleteId=${other}`, as)).status).toBe(403);
    expect((await packet('audience=staff', as)).status).toBe(403);
    expect((await get(`/trips/${TRIP}`, as)).status).toBe(403); // the rest of /trips stays staff-only
  });

  it('409 without a selected package', async () => {
    const t = trip();
    repo.trips.save({ ...t, selected_option_id: null });
    expect((await packet('audience=staff')).status).toBe(409);
    repo.trips.save(t);
  });
});

describe('public share page', () => {
  it('unpublished trip → 404', async () => {
    const r = await get(`/share/${TRIP}/whatever`);
    expect(r.status).toBe(404);
  });

  it('after publish: public variant renders; bad token → 404', async () => {
    expect((await post(`/trips/${TRIP}/approve`)).status).toBe(200);
    expect((await post(`/trips/${TRIP}/publish`)).status).toBe(200);
    const token = trip().share_token;
    expect(token.length).toBeGreaterThan(10);

    const r = await fetch(`${srv.url}/share/${TRIP}/${token}`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toMatch(/text\/html/);
    const html = await r.text();
    expect(html).toContain('<h2>Itinerary</h2>');
    expect(html).toContain('<h2>Packing list</h2>');
    expect(html).not.toContain('$');
    for (const id of trip().traveling_player_ids.slice(0, 10)) expect(html).not.toContain(esc(personName(id)));
    for (const s of pack.staff.filter((x) => x.key_contact)) {
      expect(html).not.toContain(esc(`${s.first_name} ${s.last_name}`));
      expect(html).toContain(esc(s.role));
    }

    expect((await fetch(`${srv.url}/share/${TRIP}/${token.slice(0, -1)}x`)).status).toBe(404);
    expect((await fetch(`${srv.url}/share/TRIP-NOPE/${token}`)).status).toBe(404);

    // staff packet now carries the share link
    const { packet: p } = await packet('audience=staff');
    expect(p!.share_url).toMatch(new RegExp(`/share/${TRIP}/${token}$`));
  });
});

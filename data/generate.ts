/**
 * Deterministic synthetic data pack generator.  Run: `npm run data:generate`
 * Output: data/*.json — every file is `{ synthetic: true, note, data }` and is validated against
 * packages/shared/src/domain.ts before writing. Same seed → byte-identical output.
 *
 * Real: BGSU / Falcons, opponent school names and cities.  Fictional: every person, hotel, restaurant,
 * bus company, phone number (555-01xx), stadium name and address. Distances/drive times are approximate.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  ActualsEntry, BusCompany, Game, Hotel, Player, Restaurant, Settings, StaffMember, Team, TripRequest,
  type ClassYear, type Dietary, type PositionGroup,
} from '../packages/shared/src/domain';

const OUT = dirname(fileURLToPath(import.meta.url));
const NOTE = 'SYNTHETIC DATA for the 2026 BGSU Hackathon. All people, businesses, phone numbers and addresses are fictional. Distances and drive times are approximate.';

// ---------- seeded RNG (mulberry32) ----------
let seed = 20261121;
function rand(): number {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
const money = (lo: number, hi: number, step = 1) => Math.round((lo + rand() * (hi - lo)) / step) * step;
const round2 = (n: number) => Math.round(n * 100) / 100;
function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
let phoneN = 0;
/** 555-0100..0199 is reserved for fictional use */
const phone = () => `(419) 555-01${String(phoneN++ % 100).padStart(2, '0')}`;

// ---------- team ----------
const team: Team = {
  school: 'Bowling Green State University',
  team_name: 'BGSU Falcons',
  sport: 'football',
  home_city: 'Bowling Green',
  home_state: 'OH',
  home_stadium: 'Falcon Home Field (synthetic name)',
  colors: { primary: '#FE5000', secondary: '#4F2C1D' },
  season: 2026,
};

// ---------- roster ----------
const FIRST = ['Avery', 'Brody', 'Cael', 'Dorian', 'Ezra', 'Fenn', 'Gideon', 'Hollis', 'Idris', 'Jory', 'Kenji', 'Lennox', 'Marek', 'Nico', 'Orrin', 'Pax', 'Quill', 'Rowan', 'Soren', 'Tobin', 'Ulric', 'Vance', 'Wells', 'Xavi', 'Yates', 'Zane', 'Amari', 'Bodhi', 'Cyrus', 'Dax', 'Emory', 'Finnick', 'Grady', 'Hayes', 'Ira', 'Jett', 'Koa', 'Lachlan', 'Milo', 'Nash'];
const LAST = ['Ashgrove', 'Birchfield', 'Calloway', 'Dunmore', 'Elsworth', 'Fairbank', 'Galloway', 'Hartwell', 'Ironside', 'Juniper', 'Kettering', 'Larkspur', 'Merriweather', 'Northcott', 'Oakhurst', 'Pembrook', 'Quarry', 'Redfern', 'Stonebridge', 'Thistlewood', 'Underhill', 'Valemont', 'Westbrook', 'Yarrow', 'Zephyr', 'Aldane', 'Brightwater', 'Coldwell', 'Driftwood', 'Emberly'];
const GROUPS: { g: PositionGroup; n: number; quota: number; pos: string[] }[] = [
  { g: 'QB', n: 5, quota: 4, pos: ['QB'] },
  { g: 'RB', n: 8, quota: 5, pos: ['RB', 'RB', 'FB'] },
  { g: 'WR', n: 13, quota: 10, pos: ['WR'] },
  { g: 'TE', n: 7, quota: 4, pos: ['TE'] },
  { g: 'OL', n: 17, quota: 12, pos: ['OT', 'OG', 'C'] },
  { g: 'DL', n: 15, quota: 11, pos: ['DE', 'DT', 'NT'] },
  { g: 'LB', n: 13, quota: 9, pos: ['LB'] },
  { g: 'DB', n: 18, quota: 12, pos: ['CB', 'S'] },
  { g: 'ST', n: 4, quota: 3, pos: ['K', 'P', 'LS', 'K'] },
];
const CLASS: ClassYear[] = ['FR', 'FR', 'SO', 'SO', 'JR', 'JR', 'SR', 'SR', 'GR'];
const usedNames = new Set<string>();
const jerseys = shuffle(Array.from({ length: 100 }, (_, i) => i));
type Draft = Omit<Player, 'travel_priority' | 'default_travel' | 'id'> & { score: number };
const drafts: Draft[] = [];
for (const grp of GROUPS) {
  for (let i = 0; i < grp.n; i++) {
    let first: string, last: string;
    do {
      first = pick(FIRST);
      last = pick(LAST);
    } while (usedNames.has(first + last));
    usedNames.add(first + last);
    drafts.push({
      first_name: first,
      last_name: last,
      jersey: jerseys[drafts.length]!,
      position: grp.pos[i % grp.pos.length]!,
      position_group: grp.g,
      class_year: pick(CLASS),
      travel_eligible: true,
      dietary: 'none',
      score: i / grp.quota + rand() * 0.01,
    });
  }
}
drafts.sort((a, b) => a.score - b.score);
// 4 players ineligible (injury/academic), never in the top 20
for (const idx of [27, 44, 61, 83]) drafts[idx]!.travel_eligible = false;
const DIETS: Dietary[] = ['vegetarian', 'vegetarian', 'gluten_free', 'gluten_free', 'nut_allergy', 'nut_allergy', 'vegetarian', 'gluten_free'];
for (const [k, idx] of [3, 12, 19, 33, 41, 52, 66, 90].entries()) drafts[idx]!.dietary = DIETS[k]!;
let eligibleRank = 0;
const roster: Player[] = drafts.map((d, i) => {
  const { score: _s, ...rest } = d;
  if (d.travel_eligible) eligibleRank++;
  return {
    id: `P-${String(i + 1).padStart(3, '0')}`,
    ...rest,
    travel_priority: i + 1,
    default_travel: d.travel_eligible && eligibleRank <= 70,
  };
});

// ---------- staff ----------
const COACH_ROLES = ['Head Coach', 'Offensive Coordinator', 'Defensive Coordinator', 'Special Teams Coordinator', 'Quarterbacks Coach', 'Running Backs Coach', 'Wide Receivers Coach', 'Tight Ends Coach', 'Offensive Line Coach', 'Defensive Line Coach', 'Linebackers Coach', 'Defensive Backs Coach'];
const SUPPORT: [string, string, boolean][] = [
  ['Head Athletic Trainer', 'Athletic Training', true],
  ['Assistant Athletic Trainer', 'Athletic Training', true],
  ['Assistant Athletic Trainer', 'Athletic Training', true],
  ['Team Physician', 'Medical', true],
  ['Equipment Manager', 'Equipment', true],
  ['Assistant Equipment Manager', 'Equipment', true],
  ['Assistant Equipment Manager', 'Equipment', false],
  ['Director of Football Operations', 'Operations', true],
  ['Assistant Director of Operations', 'Operations', true],
  ['Director of Strength & Conditioning', 'Strength', true],
  ['Assistant Strength Coach', 'Strength', false],
  ['Football Communications Director', 'Communications', true],
  ['Video Coordinator', 'Operations', true],
  ['Sports Dietitian', 'Medical', true],
  ['Academic Coordinator', 'Academics', false],
];
const KEY = new Set(['Head Coach', 'Head Athletic Trainer', 'Equipment Manager', 'Director of Football Operations']);
const staffNames = new Set<string>();
const sname = () => {
  let n: [string, string];
  do n = [pick(FIRST.concat(['Dana', 'Morgan', 'Casey', 'Jordan', 'Riley', 'Taylor', 'Quinn', 'Reese'])), pick(LAST)];
  while (staffNames.has(n.join(' ')) || usedNames.has(n.join('')));
  staffNames.add(n.join(' '));
  return n;
};
const staff: StaffMember[] = [
  ...COACH_ROLES.map((role) => ({ role, category: 'coach' as const, department: 'Coaching', travels: true })),
  ...SUPPORT.map(([role, department, travels]) => ({ role, category: 'support' as const, department, travels })),
].map((s, i) => {
  const [first_name, last_name] = sname();
  return {
    id: `S-${String(i + 1).padStart(3, '0')}`,
    first_name,
    last_name,
    role: s.role,
    category: s.category,
    department: s.department,
    phone: phone(),
    travels_by_default: s.travels,
    key_contact: KEY.has(s.role),
  };
});

// ---------- schedule (synthetic dates; shifted later than a real MAC season so the Nov 21 demo has upcoming trips) ----------
type G = Omit<Game, 'game_id' | 'week'>;
const home = (opponent: string, date: string, kickoff: string): G => ({
  opponent, city: 'Bowling Green', state: 'OH', stadium_name: team.home_stadium, date, kickoff_local: kickoff,
  home_away: 'home', road_miles_one_way: 0, drive_hours_one_way: 0, route_stop_city: '',
});
const away = (opponent: string, city: string, state: string, stadium: string, date: string, kickoff: string, miles: number, hours: number, stop = ''): G => ({
  opponent, city, state, stadium_name: stadium, date, kickoff_local: kickoff, home_away: 'away',
  road_miles_one_way: miles, drive_hours_one_way: hours, route_stop_city: stop,
});
const schedule: Game[] = [
  home('Robert Morris', '2026-09-26', '18:00'),
  away('Kent State', 'Kent', 'OH', 'Cuyahoga Valley Field (synthetic)', '2026-10-03', '15:30', 150, 2.6),
  home('Akron', '2026-10-10', '15:30'),
  away('Western Michigan', 'Kalamazoo', 'MI', 'Kalamazoo River Stadium (synthetic)', '2026-10-17', '12:00', 165, 2.8),
  home('Toledo', '2026-10-24', '19:00'),
  away('Ball State', 'Muncie', 'IN', 'White River Bowl (synthetic)', '2026-10-31', '14:00', 160, 2.9),
  home('Central Michigan', '2026-11-07', '15:30'),
  away('Miami (OH)', 'Oxford', 'OH', 'Talawanda Field (synthetic)', '2026-11-14', '15:30', 175, 3.0),
  home('Eastern Michigan', '2026-11-21', '12:00'),
  away('Ohio', 'Athens', 'OH', 'Hocking Valley Stadium (synthetic)', '2026-11-28', '12:00', 200, 3.6, 'Columbus'),
  home('Massachusetts', '2026-12-05', '15:30'),
  away('Buffalo', 'Buffalo', 'NY', 'Niagara Frontier Field (synthetic)', '2026-12-12', '13:00', 295, 4.7, 'Erie'),
].map((g, i) => ({ game_id: `G${String(i + 1).padStart(2, '0')}`, week: i + 1, ...g }));
const awayGames = schedule.filter((g) => g.home_away === 'away');

// ---------- hotels ----------
const CITY_CODE: Record<string, string> = { Kent: 'KEN', Kalamazoo: 'KAL', Muncie: 'MUN', Oxford: 'OXF', Athens: 'ATH', Buffalo: 'BUF', Columbus: 'CMH', Erie: 'ERI' };
const HOTEL_WORDS = [['Lantern', 'Copperleaf', 'Harbor Oak', 'Kestrel', 'Bluestem', 'Granite Row', 'Willowmere', 'Quarry Hill'], ['Inn', 'Suites', 'Lodge', 'Hotel & Conference Center', 'Stay']];
const hotels: Hotel[] = [];
for (const g of awayGames) {
  const n = g.city === 'Buffalo' || g.city === 'Athens' ? 4 : 3;
  const words = shuffle(HOTEL_WORDS[0]!);
  for (let i = 0; i < n; i++) {
    // i=0: budget, far; i=1: mid; i=2: close w/ meal service; i=3: small (insufficient rooms)
    const profile = i;
    const meal = profile === 2 || (profile === 1 && rand() < 0.4);
    hotels.push({
      hotel_id: `H-${CITY_CODE[g.city]}-${i + 1}`,
      city: g.city,
      name: `${words[i]} ${pick(HOTEL_WORDS[1]!)} ${g.city} (synthetic)`,
      address: `${int(100, 9800)} ${pick(['Commerce', 'Meridian', 'Founders', 'Lakeview', 'Station', 'College'])} ${pick(['Ave', 'Blvd', 'Dr', 'Pkwy'])}, ${g.city}, ${g.state}`,
      phone: phone(),
      nightly_rate: [money(112, 128), money(139, 159), money(179, 209), money(125, 145)][profile]!,
      tax_rate: round2(money(10, 15) / 100),
      rooms_available: [int(60, 80), int(58, 75), int(56, 66), int(38, 46)][profile]!,
      max_occupancy: 4,
      miles_to_stadium: [round2(9 + rand() * 6), round2(3 + rand() * 3), round2(0.6 + rand() * 1.2), round2(4 + rand() * 4)][profile]!,
      has_meeting_room: profile !== 0,
      has_team_meal_service: meal,
      team_meal_price_pp: meal ? money(22, 32) : 0,
    });
  }
}

// ---------- restaurants ----------
const R_WORDS = ['Ember & Oak Grill', 'Big Field Smokehouse', 'Bright Kettle Kitchen', 'Iron Skillet Diner', 'Harvest Table', 'Copper Pot Pasta', 'Northside Taqueria', 'Lakeshore Pizza Co.', 'Greenline Bowls', 'Two Rivers Deli', 'Hilltop Chicken & Biscuits', 'Saffron Garden'];
const CUISINE: Record<string, string> = { 'Ember & Oak Grill': 'American grill', 'Big Field Smokehouse': 'BBQ', 'Bright Kettle Kitchen': 'Comfort food', 'Iron Skillet Diner': 'Diner', 'Harvest Table': 'Buffet', 'Copper Pot Pasta': 'Italian', 'Northside Taqueria': 'Mexican', 'Lakeshore Pizza Co.': 'Pizza', 'Greenline Bowls': 'Grain bowls', 'Two Rivers Deli': 'Deli / boxed meals', 'Hilltop Chicken & Biscuits': 'Southern', 'Saffron Garden': 'Indian' };
const restaurants: Restaurant[] = [];
const restCities = [...awayGames.map((g) => ({ city: g.city, stop: false })), { city: 'Columbus', stop: true }, { city: 'Erie', stop: true }];
for (const { city, stop } of restCities) {
  const n = stop ? 4 : int(5, 6);
  const names = shuffle(R_WORDS).slice(0, n);
  names.forEach((name, i) => {
    const opts = new Set<Dietary>(['none']);
    if (rand() < 0.7) opts.add('vegetarian');
    if (rand() < 0.5) opts.add('gluten_free');
    if (rand() < 0.45) opts.add('nut_allergy');
    if (i === 0) ['vegetarian', 'gluten_free', 'nut_allergy'].forEach((d) => opts.add(d as Dietary)); // ≥1 fully accommodating
    restaurants.push({
      restaurant_id: `R-${CITY_CODE[city]}-${i + 1}`,
      city,
      name: `${name} (synthetic)`,
      price_per_person: money(12, 34),
      capacity: i === n - 1 ? int(30, 60) : int(80, 160),
      miles_to_hotel: round2(0.3 + rand() * 6),
      miles_to_stadium: round2(0.5 + rand() * 8),
      cuisine: CUISINE[name]!,
      dietary_options: [...opts],
      group_friendly: i === n - 1 ? false : rand() < 0.75 || i === 0,
      route_stop: stop,
    });
  });
}

// ---------- bus companies ----------
const busRates: BusCompany[] = [
  { company_id: 'BUS-1', name: 'Maumee Valley Coachlines (synthetic)', phone: phone(), seats_per_bus: 56, daily_rate: 1450, per_mile_rate: 3.1, driver_room_required_overnight: true, equipment_truck_daily_rate: 650, equipment_truck_per_mile_rate: 1.85 },
  { company_id: 'BUS-2', name: 'Great Black Swamp Charter (synthetic)', phone: phone(), seats_per_bus: 56, daily_rate: 1600, per_mile_rate: 2.75, driver_room_required_overnight: true, equipment_truck_daily_rate: 700, equipment_truck_per_mile_rate: 1.7 },
  { company_id: 'BUS-3', name: 'Portage River Motorcoach (synthetic)', phone: phone(), seats_per_bus: 54, daily_rate: 1350, per_mile_rate: 3.4, driver_room_required_overnight: true, equipment_truck_daily_rate: 600, equipment_truck_per_mile_rate: 2.0 },
];

// ---------- settings ----------
const settings: Settings = {
  seats_per_bus_override: null,
  player_room_occupancy: 2,
  coach_room_occupancy: 1,
  support_room_occupancy: 2,
  meal_allowance_per_meal: 28,
  avg_bus_mph: 55,
  departure_buffer_min: 30,
  min_hours_arrival_before_kickoff: 3,
  min_hours_meal_before_kickoff: 3,
  latest_hotel_arrival: '23:00',
  contingency_pct: 8,
  // A-15 demo tuning (DECISIONS D-28): seeded projected ≈ 4.9% over; savings after planning G10 bring it back under
  season_travel_budget: 168000,
  default_bus_company_id: 'BUS-1',
  roommate_request_deadline_days_before: 3,
  packing_list: ['Travel polo + game-day suit', 'Student ID', 'Phone + charger', 'Course materials for study hall', 'Medications (tell athletic training first)', 'Toiletries', 'Sleepwear', 'Headphones', 'Cleats & personal gear go on the equipment truck by Thursday 6 PM'],
};

// ---------- actuals (trips already played) ----------
const actuals: ActualsEntry[] = [
  { trip_id: 'TRIP-G02', bus: 9184.5, equipment: 1205, hotel: 9031.2, meals: 6894, other: 412.75, notes: 'Synthetic actuals. Bus fuel surcharge added.', entered_at: '2026-10-06T15:20:00.000Z' },
  { trip_id: 'TRIP-G04', bus: 9622, equipment: 1310, hotel: 10248.9, meals: 7380.4, other: 260, notes: 'Synthetic actuals. Extra room for team physician.', entered_at: '2026-10-20T14:05:00.000Z' },
];

// ---------- seeded trips (server loads these into the DB on first start) ----------
const coaches = staff.filter((s) => s.category === 'coach' && s.travels_by_default).length;
const support = staff.filter((s) => s.category === 'support' && s.travels_by_default).length;
const players = roster.filter((p) => p.default_travel).length;
const defaultRequest = (game_id: string): TripRequest => ({
  game_id, players, coaches, support_staff: support,
  departure_constraint: { kind: 'none', datetime_local: '', raw_text: '' },
  include_equipment_truck: true,
  caps: { lodging: null, meals: null, bus: null, total: null },
  excluded_hotel_ids: [], preference: 'none', notes: '',
});
const TripSeed = z.object({
  trip_id: z.string(), game_id: z.string(),
  status: z.enum(['not_started', 'draft', 'approved', 'published', 'completed']),
  request: TripRequest.nullable(),
  selected_tier: z.enum(['A', 'B', 'C']).nullable(),
});
const tripsSeed: z.infer<typeof TripSeed>[] = [
  { trip_id: 'TRIP-G02', game_id: 'G02', status: 'completed', request: defaultRequest('G02'), selected_tier: 'A' },
  { trip_id: 'TRIP-G04', game_id: 'G04', status: 'completed', request: defaultRequest('G04'), selected_tier: 'B' },
  { trip_id: 'TRIP-G06', game_id: 'G06', status: 'completed', request: defaultRequest('G06'), selected_tier: 'A' },
  { trip_id: 'TRIP-G08', game_id: 'G08', status: 'completed', request: defaultRequest('G08'), selected_tier: 'B' },
  { trip_id: 'TRIP-G10', game_id: 'G10', status: 'not_started', request: null, selected_tier: null },
  { trip_id: 'TRIP-G12', game_id: 'G12', status: 'draft', request: { ...defaultRequest('G12'), notes: 'Long trip — consider Game-Ready.' }, selected_tier: 'C' },
];

// ---------- write ----------
function write<T extends z.ZodType>(file: string, schema: T, data: z.input<T>) {
  const parsed = schema.parse(data);
  writeFileSync(join(OUT, file), JSON.stringify({ synthetic: true, note: NOTE, data: parsed }, null, 2) + '\n');
  console.log(`wrote data/${file}`);
}
write('team.json', Team, team);
write('roster.json', z.array(Player), roster);
write('staff.json', z.array(StaffMember), staff);
write('schedule.json', z.array(Game), schedule);
write('hotels.json', z.array(Hotel), hotels);
write('restaurants.json', z.array(Restaurant), restaurants);
write('bus_rates.json', z.array(BusCompany), busRates);
write('settings.json', Settings, settings);
write('actuals.json', z.array(ActualsEntry), actuals);
write('trips_seed.json', z.array(TripSeed), tripsSeed);
console.log(`roster ${roster.length} (default travel ${players}), staff ${staff.length} (travel: ${coaches} coaches, ${support} support), away games ${awayGames.length}, hotels ${hotels.length}, restaurants ${restaurants.length}`);

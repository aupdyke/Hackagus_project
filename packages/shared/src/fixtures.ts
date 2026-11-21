/**
 * FIXTURES — schema-valid sample payloads for stub routes, AIVANA_MOCK, and UI work before the engine exists.
 * Numbers are hand-computed with the A-01 formulas for G10 (at Ohio, Sat Nov 28, noon kickoff) so the UI
 * looks realistic. Replace usage with real engine output as Track A lands (don't delete — tests use them).
 */
import type {
  AiUsageSummary, AssistantReply, AthleteNotification, AthleteTripView, BudgetVsActual, Game, ItineraryItem,
  MealLine, ParseResult, Recommendation, Rooming, SavingsResult, SeasonRollup, TravelPackage, Trip, TripDetail,
  TripRequest, TripSummary,
} from './domain';

const NOW = '2026-11-20T18:00:00.000Z';

export const FIXTURE_GAME: Game = {
  game_id: 'G10', week: 10, opponent: 'Ohio', city: 'Athens', state: 'OH',
  stadium_name: 'Hocking Valley Stadium', date: '2026-11-28', kickoff_local: '12:00',
  home_away: 'away', road_miles_one_way: 200, drive_hours_one_way: 3.6, route_stop_city: 'Columbus',
};

export const FIXTURE_REQUEST: TripRequest = {
  game_id: 'G10', players: 70, coaches: 12, support_staff: 12,
  departure_constraint: { kind: 'not_before', datetime_local: '2026-11-27T11:00', raw_text: "can't leave before 11 AM Friday" },
  include_equipment_truck: true,
  caps: { lodging: null, meals: null, bus: null, total: null },
  excluded_hotel_ids: [], preference: 'none', notes: '',
};

const it = (n: number, kind: ItineraryItem['kind'], label: string, start: string, end: string, location: string, meal_id = ''): ItineraryItem => ({
  id: `IT-${n}`, kind, label, start_local: start, end_local: end, location, meal_id,
});

export const FIXTURE_ITINERARY: ItineraryItem[] = [
  it(1, 'depart', 'Buses depart', '2026-11-27T11:00', '', 'BGSU Football Complex, Bowling Green, OH'),
  it(2, 'meal', 'En-route lunch', '2026-11-27T13:15', '2026-11-27T14:00', 'Two Rivers Deli, Columbus', 'ML-1'),
  it(3, 'arrive_hotel', 'Arrive at hotel', '2026-11-27T15:30', '', 'Quarry Hill Suites Athens'),
  it(4, 'checkin', 'Hotel check-in', '2026-11-27T15:30', '2026-11-27T16:00', 'Quarry Hill Suites Athens'),
  it(5, 'walkthrough', 'Stadium walkthrough', '2026-11-27T16:30', '2026-11-27T17:30', 'Hocking Valley Stadium'),
  it(6, 'meal', 'Team dinner', '2026-11-27T18:30', '2026-11-27T19:30', 'Harvest Table, Athens', 'ML-2'),
  it(7, 'meeting', 'Position meetings', '2026-11-27T20:00', '2026-11-27T21:30', 'Hotel'),
  it(8, 'curfew', 'Curfew / lights out', '2026-11-27T22:30', '', 'Hotel'),
  it(9, 'meal', 'Pre-game meal', '2026-11-28T08:00', '2026-11-28T08:45', 'Harvest Table, Athens', 'ML-3'),
  it(10, 'depart_hotel', 'Buses depart hotel', '2026-11-28T09:15', '', 'Quarry Hill Suites Athens'),
  it(11, 'arrive_stadium', 'Arrive at stadium', '2026-11-28T09:45', '', 'Hocking Valley Stadium'),
  it(12, 'kickoff', 'Kickoff vs Ohio', '2026-11-28T12:00', '', 'Hocking Valley Stadium'),
  it(13, 'depart_return', 'Buses depart for home (boxed meal on bus)', '2026-11-28T16:00', '', 'Hocking Valley Stadium', 'ML-4'),
  it(14, 'arrive_home', 'Arrive home', '2026-11-28T19:45', '', 'BGSU Football Complex, Bowling Green, OH'),
];

const meal = (n: number, kind: MealLine['kind'], itemId: string, source: MealLine['source'], vendor_id: string, vendor_name: string, time: string, ppp: number, gaps: MealLine['dietary_gaps'] = []): MealLine => ({
  meal_id: `ML-${n}`, kind, itinerary_item_id: itemId, source, vendor_id, vendor_name, time_local: time,
  headcount: 94, price_per_person: ppp, cost: Math.round(94 * ppp * 100) / 100, over_allowance: ppp > 28, dietary_gaps: gaps,
});

const counts = { players: 70, coaches: 12, support: 12, travelers: 94, drivers: 3, buses: 2, seats_per_bus: 56, rooms_players: 35, rooms_coaches: 12, rooms_support: 6, rooms_drivers: 3, rooms_total: 56 };

function pkg(tier: 'A' | 'B' | 'C', label: TravelPackage['label'], hotel_id: string, hotel_name: string, costs: TravelPackage['costs'], meals: MealLine[], flags: TravelPackage['risk_flags']): TravelPackage {
  return {
    option_id: `PKG-G10-${tier}`, game_id: 'G10', tier, label, feasible: true, infeasible_reason: '',
    hotel_id, hotel_name, bus_company_id: 'BUS-1',
    departure_local: tier === 'C' ? '2026-11-27T11:00' : '2026-11-27T11:00', return_local: '2026-11-28T19:45',
    nights: 1, trip_days: 2, round_trip_miles: 400, counts, meals, costs,
    itinerary: FIXTURE_ITINERARY, risk_flags: flags,
  };
}

export const FIXTURE_PACKAGES: TravelPackage[] = [
  pkg('A', 'Economy', 'H-ATH-1', 'Quarry Hill Suites Athens',
    { bus: 8676.63, equipment: 2040, hotel: 7007.13, meals: 6674, subtotal: 24397.76, contingency: 1951.82, total: 26349.58 },
    [
      meal(1, 'en_route_lunch', 'IT-2', 'restaurant', 'R-CMH-2', 'Two Rivers Deli', '2026-11-27T13:15', 26),
      meal(2, 'team_dinner', 'IT-6', 'restaurant', 'R-ATH-5', 'Harvest Table', '2026-11-27T18:30', 15),
      meal(3, 'pregame_meal', 'IT-9', 'restaurant', 'R-ATH-5', 'Harvest Table', '2026-11-28T08:00', 15),
      meal(4, 'postgame_boxed', 'IT-13', 'restaurant', 'R-ATH-5', 'Harvest Table', '2026-11-28T16:00', 15),
    ],
    [{ code: 'meal_close_to_kickoff', severity: 'warning', message: 'Pre-game meal ends 3.25 hours before kickoff — close to the 3-hour minimum.', option_id: 'PKG-G10-A', related_item_id: 'IT-9' }],
  ),
  pkg('B', 'Balanced', 'H-ATH-2', 'Bluestem Lodge Athens',
    { bus: 8759.52, equipment: 2040, hotel: 8471.52, meals: 9212, subtotal: 28483.04, contingency: 2278.64, total: 30761.68 },
    [
      meal(1, 'en_route_lunch', 'IT-2', 'restaurant', 'R-CMH-1', 'Lakeshore Pizza Co.', '2026-11-27T13:15', 32),
      meal(2, 'team_dinner', 'IT-6', 'restaurant', 'R-ATH-2', 'Saffron Garden', '2026-11-27T18:30', 21),
      meal(3, 'pregame_meal', 'IT-9', 'restaurant', 'R-ATH-2', 'Saffron Garden', '2026-11-28T08:00', 21),
      meal(4, 'postgame_boxed', 'IT-13', 'restaurant', 'R-ATH-4', 'Lakeshore Pizza Co.', '2026-11-28T16:00', 24, ['vegetarian', 'nut_allergy']),
    ],
    [
      { code: 'meal_over_allowance', severity: 'warning', message: 'En-route lunch is $32 per person, over the $28 meal allowance.', option_id: 'PKG-G10-B', related_item_id: 'IT-2' },
      { code: 'dietary_gap', severity: 'warning', message: 'Post-game boxed meal vendor has no vegetarian or nut-allergy option (4 travelers affected).', option_id: 'PKG-G10-B', related_item_id: 'IT-13' },
    ],
  ),
  pkg('C', 'Game-Ready', 'H-ATH-3', 'Kestrel Lodge Athens',
    { bus: 8892.72, equipment: 2040, hotel: 10824.72, meals: 11092, subtotal: 32849.44, contingency: 2627.96, total: 35477.4 },
    [
      meal(1, 'en_route_lunch', 'IT-2', 'restaurant', 'R-CMH-1', 'Lakeshore Pizza Co.', '2026-11-27T13:15', 32),
      meal(2, 'team_dinner', 'IT-6', 'hotel', 'H-ATH-3', 'Kestrel Lodge Athens — team meal', '2026-11-27T18:30', 31),
      meal(3, 'pregame_meal', 'IT-9', 'hotel', 'H-ATH-3', 'Kestrel Lodge Athens — team meal', '2026-11-28T08:00', 31),
      meal(4, 'postgame_boxed', 'IT-13', 'restaurant', 'R-ATH-4', 'Lakeshore Pizza Co.', '2026-11-28T16:00', 24, ['vegetarian', 'nut_allergy']),
    ],
    [{ code: 'meal_over_allowance', severity: 'warning', message: '3 meals are over the $28 meal allowance.', option_id: 'PKG-G10-C', related_item_id: 'IT-6' }],
  ),
];

export const FIXTURE_RECOMMENDATION: Recommendation = {
  recommended_option_id: 'PKG-G10-B',
  ranking: ['PKG-G10-B', 'PKG-G10-A', 'PKG-G10-C'],
  tradeoffs: [
    { option_id: 'PKG-G10-A', pros: ['Lowest total estimate'], cons: ['Hotel is farthest from the stadium', 'No meeting room'] },
    { option_id: 'PKG-G10-B', pros: ['Meeting room for position meetings', 'Much closer to the stadium than PKG-G10-A'], cons: ['En-route lunch over allowance', 'Boxed meal dietary gap'] },
    { option_id: 'PKG-G10-C', pros: ['Closest to the stadium', 'Hotel team meals'], cons: ['Highest total estimate', 'Meals over allowance'] },
  ],
  explanation: 'PKG-G10-B balances cost and readiness: it has a meeting room and is much closer to the stadium than PKG-G10-A, for less than PKG-G10-C. Fix the boxed-meal dietary gap before approving.',
  source: 'template',
  fact_guard: { passed: true, replaced: false, issues: [] },
  created_at: NOW,
};

export const FIXTURE_ROOMING: Rooming = {
  trip_id: 'TRIP-G10', generated_at: NOW,
  rooms: [
    { room_id: 'RM-01', kind: 'player', occupant_ids: ['P-004', 'P-010'] },
    { room_id: 'RM-02', kind: 'player', occupant_ids: ['P-001', 'P-002'] },
    { room_id: 'RM-03', kind: 'player', occupant_ids: ['P-003', 'P-005'] },
    { room_id: 'RM-36', kind: 'coach', occupant_ids: ['S-001'] },
    { room_id: 'RM-48', kind: 'support', occupant_ids: ['S-013', 'S-014'] },
    { room_id: 'RM-54', kind: 'driver', occupant_ids: ['DRIVER-1'] },
  ],
  requests_honored: 9, requests_total: 12, edited: false,
};

export const FIXTURE_TRIP: Trip = {
  trip_id: 'TRIP-G10', game_id: 'G10', status: 'draft', request: FIXTURE_REQUEST, packages: FIXTURE_PACKAGES,
  selected_option_id: 'PKG-G10-B', recommendation: FIXTURE_RECOMMENDATION, whatif_history: [], memo: null,
  traveling_player_ids: [], traveling_staff_ids: [], rooming: FIXTURE_ROOMING,
  buses: [{ bus_number: 1, traveler_ids: ['S-001', 'P-005', 'P-006'] }, { bus_number: 2, traveler_ids: ['P-001', 'P-002', 'P-004'] }],
  roommate_deadline_local: '2026-11-24T23:59', published_version: 0, published_at: '', share_token: '', updated_at: NOW,
};

export const FIXTURE_TRIP_DETAIL: TripDetail = { trip: FIXTURE_TRIP, game: FIXTURE_GAME };

export const FIXTURE_TRIP_SUMMARIES: TripSummary[] = [
  { trip_id: 'TRIP-G02', game_id: 'G02', opponent: 'Kent State', city: 'Kent', state: 'OH', date: '2026-10-03', kickoff_local: '15:30', status: 'completed', selected_option_id: 'PKG-G02-A', selected_label: 'Economy', estimated_total: 25410.2, risk_count: 0 },
  { trip_id: 'TRIP-G04', game_id: 'G04', opponent: 'Western Michigan', city: 'Kalamazoo', state: 'MI', date: '2026-10-17', kickoff_local: '12:00', status: 'completed', selected_option_id: 'PKG-G04-B', selected_label: 'Balanced', estimated_total: 28950.75, risk_count: 1 },
  { trip_id: 'TRIP-G06', game_id: 'G06', opponent: 'Ball State', city: 'Muncie', state: 'IN', date: '2026-10-31', kickoff_local: '14:00', status: 'completed', selected_option_id: 'PKG-G06-A', selected_label: 'Economy', estimated_total: 26120.4, risk_count: 0 },
  { trip_id: 'TRIP-G08', game_id: 'G08', opponent: 'Miami (OH)', city: 'Oxford', state: 'OH', date: '2026-11-14', kickoff_local: '15:30', status: 'completed', selected_option_id: 'PKG-G08-B', selected_label: 'Balanced', estimated_total: 29480.1, risk_count: 1 },
  { trip_id: 'TRIP-G10', game_id: 'G10', opponent: 'Ohio', city: 'Athens', state: 'OH', date: '2026-11-28', kickoff_local: '12:00', status: 'draft', selected_option_id: 'PKG-G10-B', selected_label: 'Balanced', estimated_total: 30761.68, risk_count: 2 },
  { trip_id: 'TRIP-G12', game_id: 'G12', opponent: 'Buffalo', city: 'Buffalo', state: 'NY', date: '2026-12-12', kickoff_local: '13:00', status: 'not_started', selected_option_id: null, selected_label: '', estimated_total: null, risk_count: 0 },
];

export const FIXTURE_SEASON: SeasonRollup = {
  budget: 165000, committed: 113412.8, projected: 181374.48, remaining: -16374.48, over_budget: true,
  rows: [
    { trip_id: 'TRIP-G02', game_id: 'G02', opponent: 'Kent State', date: '2026-10-03', status: 'completed', selected_option_id: 'PKG-G02-A', selected_label: 'Economy', planned_cost: 25410.2, actual_cost: 26727.45, variance: 1317.25, risk_count: 0, counts_toward: 'committed' },
    { trip_id: 'TRIP-G04', game_id: 'G04', opponent: 'Western Michigan', date: '2026-10-17', status: 'completed', selected_option_id: 'PKG-G04-B', selected_label: 'Balanced', planned_cost: 28950.75, actual_cost: 28821.3, variance: -129.45, risk_count: 1, counts_toward: 'committed' },
    { trip_id: 'TRIP-G06', game_id: 'G06', opponent: 'Ball State', date: '2026-10-31', status: 'completed', selected_option_id: 'PKG-G06-A', selected_label: 'Economy', planned_cost: 26120.4, actual_cost: null, variance: null, risk_count: 0, counts_toward: 'committed' },
    { trip_id: 'TRIP-G08', game_id: 'G08', opponent: 'Miami (OH)', date: '2026-11-14', status: 'completed', selected_option_id: 'PKG-G08-B', selected_label: 'Balanced', planned_cost: 29480.1, actual_cost: null, variance: null, risk_count: 1, counts_toward: 'committed' },
    { trip_id: 'TRIP-G10', game_id: 'G10', opponent: 'Ohio', date: '2026-11-28', status: 'draft', selected_option_id: 'PKG-G10-B', selected_label: 'Balanced', planned_cost: 30761.68, actual_cost: null, variance: null, risk_count: 2, counts_toward: 'projected' },
    { trip_id: 'TRIP-G12', game_id: 'G12', opponent: 'Buffalo', date: '2026-12-12', status: 'draft', selected_option_id: 'PKG-G12-C', selected_label: 'Game-Ready', planned_cost: 37200, actual_cost: null, variance: null, risk_count: 1, counts_toward: 'projected' },
  ],
  actuals: { trips_completed: 2, planned_total: 54360.95, actual_total: 55548.75, variance: 1187.8 },
};

export const FIXTURE_SAVINGS: SavingsResult = {
  candidates: [
    { candidate_id: 'SAV-1', kind: 'switch_package', trip_id: 'TRIP-G12', description: 'Buffalo: switch Game-Ready → Economy', savings: 9850.25, new_option_id: 'PKG-G12-A' },
    { candidate_id: 'SAV-2', kind: 'switch_package', trip_id: 'TRIP-G10', description: 'Ohio: switch Balanced → Economy', savings: 4412.1, new_option_id: 'PKG-G10-A' },
    { candidate_id: 'SAV-3', kind: 'reduce_travelers', trip_id: 'TRIP-G12', description: 'Buffalo: travel 5 fewer players', savings: 1630.4, new_option_id: 'PKG-G12-C' },
  ],
  selected_candidate_ids: ['SAV-1', 'SAV-2', 'SAV-3'],
  explanation: 'SAV-1 and SAV-2 move the two remaining drafts to Economy, which covers most of the gap; SAV-3 closes the rest without changing hotels.',
  projected_before: 181374.48, projected_after: 165481.73, total_savings: 15892.75, back_under_budget: false,
  source: 'template', fact_guard: { passed: true, replaced: false, issues: [] },
};

export const FIXTURE_BUDGET_VS_ACTUAL: BudgetVsActual = {
  trip_id: 'TRIP-G02', option_id: 'PKG-G02-A',
  lines: [
    { category: 'bus', planned: 8540.2, actual: 9184.5, variance: 644.3 },
    { category: 'equipment', planned: 1255, actual: 1205, variance: -50 },
    { category: 'hotel', planned: 8790, actual: 9031.2, variance: 241.2 },
    { category: 'meals', planned: 6942, actual: 6894, variance: -48 },
    { category: 'other', planned: 0, actual: 412.75, variance: 412.75 },
    { category: 'contingency', planned: 1883, actual: null, variance: null },
  ],
  planned_total: 25410.2, actual_total: 26727.45, variance_total: 1317.25,
};

export const FIXTURE_PARSE: ParseResult = {
  draft: {
    game_id: 'G10', opponent_text: 'Ohio', players: 70, coaches: 12, support_staff: null,
    departure_constraint: { kind: 'not_before', datetime_local: '2026-11-27T11:00', raw_text: "can't leave before 11 Friday" },
    include_equipment_truck: true, notes: '',
  },
  missing_fields: ['support_staff'],
  ambiguities: [{ field: 'support_staff', message: 'Number of support staff was not mentioned.' }],
  source: 'ai', notice: '',
};

export const FIXTURE_ATHLETE_VIEW: AthleteTripView = {
  trip_id: 'TRIP-G10', version: 1, athlete_id: 'P-004', game: FIXTURE_GAME,
  hotel: { hotel_id: 'H-ATH-2', name: 'Bluestem Lodge Athens', address: '123 College Ave, Athens, OH', phone: '(419) 555-0150' },
  bus_number: 2, room_id: 'RM-01', roommates: [{ id: 'P-010', name: 'Teammate P-010' }],
  itinerary: FIXTURE_ITINERARY,
  meals: FIXTURE_PACKAGES[1]!.meals.map((m) => ({ meal_id: m.meal_id, kind: m.kind, time_local: m.time_local, vendor_name: m.vendor_name, itinerary_item_id: m.itinerary_item_id })),
  packing_list: ['Travel polo + game-day suit', 'Student ID', 'Phone + charger'],
  departure_local: '2026-11-27T11:00', roommate_deadline_local: '2026-11-24T23:59', published_at: NOW,
  share_url: 'http://localhost:3000/share/TRIP-G10/fixture-token',
};

export const FIXTURE_NOTIFICATIONS: AthleteNotification[] = [
  {
    id: 'N-1', athlete_id: 'P-004', trip_id: 'TRIP-G10', version: 2, created_at: NOW,
    title: 'Ohio trip updated: departure time changed',
    body: 'Buses now depart Fri Nov 27 at 12:00 PM (was 11:00 AM).',
    changes: [{ kind: 'time', item_id: 'IT-1', label: 'Buses depart', before: 'Fri Nov 27, 11:00 AM', after: 'Fri Nov 27, 12:00 PM' }],
    read: false,
  },
];

export const FIXTURE_ASSISTANT: AssistantReply = {
  answer: 'Buses depart Friday at 11:00 AM from the BGSU Football Complex.',
  cited_fact_ids: ['IT-1'],
  citations: [{ id: 'IT-1', text: 'Buses depart Fri Nov 27, 11:00 AM — BGSU Football Complex, Bowling Green, OH' }],
  needs_staff: false, source: 'ai', fact_guard: { passed: true, replaced: false, issues: [] },
};

export const FIXTURE_AI_USAGE: AiUsageSummary = {
  totals: { calls: 0, errors: 0, input_tokens: 0, output_tokens: 0, credits: 0, avg_latency_ms: 0 },
  by_feature: [], recent: [], mock_mode: true,
};

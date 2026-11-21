/**
 * Domain schemas (Zod) + inferred TypeScript types.
 * Single source of truth for data pack files, server storage, API payloads and the mobile app.
 *
 * Conventions:
 *  - All money values are USD numbers rounded to cents by code (never by the model).
 *  - Local times are strings without time zone: date `YYYY-MM-DD`, clock `HH:MM` (24h), datetime `YYYY-MM-DDTHH:MM`.
 *  - IDs are stable strings: players `P-001`, staff `S-001`, games `G01`, hotels `H-KEN-1`, restaurants `R-KEN-1`,
 *    bus companies `BUS-1`, trips `TRIP-G04`, packages `PKG-G04-A`, itinerary items `IT-1`, rooms `RM-01`,
 *    savings candidates `SAV-1`, facts (assistant) reuse itinerary ids plus `F-*` ids.
 */
import { z } from 'zod';

// ---------- primitives ----------
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
export const ClockTime = z.string().regex(/^\d{2}:\d{2}$/, 'expected HH:MM (24h)');
export const LocalDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'expected YYYY-MM-DDTHH:MM');
export const Money = z.number().finite();
export const Count = z.number().int().min(0);

// ---------- data pack ----------
export const PositionGroup = z.enum(['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'ST']);
export type PositionGroup = z.infer<typeof PositionGroup>;
export const ClassYear = z.enum(['FR', 'SO', 'JR', 'SR', 'GR']);
export type ClassYear = z.infer<typeof ClassYear>;
export const Dietary = z.enum(['none', 'vegetarian', 'gluten_free', 'nut_allergy']);
export type Dietary = z.infer<typeof Dietary>;

export const Team = z.object({
  school: z.string(),
  team_name: z.string(),
  sport: z.literal('football'),
  home_city: z.string(),
  home_state: z.string(),
  home_stadium: z.string(),
  colors: z.object({ primary: z.string(), secondary: z.string() }),
  season: z.number().int(),
});
export type Team = z.infer<typeof Team>;

export const Player = z.object({
  id: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  jersey: z.number().int().min(0).max(99),
  position: z.string(),
  position_group: PositionGroup,
  class_year: ClassYear,
  travel_eligible: z.boolean(),
  default_travel: z.boolean(),
  /** 1 = first to travel. Code takes the N lowest eligible priorities when a trip has N players. */
  travel_priority: z.number().int().min(1),
  dietary: Dietary,
});
export type Player = z.infer<typeof Player>;

export const StaffCategory = z.enum(['coach', 'support']);
export type StaffCategory = z.infer<typeof StaffCategory>;
export const StaffMember = z.object({
  id: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  role: z.string(),
  category: StaffCategory,
  department: z.string(),
  phone: z.string(),
  travels_by_default: z.boolean(),
  /** shown in packets as a key contact */
  key_contact: z.boolean(),
});
export type StaffMember = z.infer<typeof StaffMember>;

export const Game = z.object({
  game_id: z.string(),
  week: z.number().int(),
  opponent: z.string(),
  city: z.string(),
  state: z.string(),
  stadium_name: z.string(),
  date: IsoDate,
  kickoff_local: ClockTime,
  home_away: z.enum(['home', 'away']),
  /** approximate, synthetic */
  road_miles_one_way: z.number().min(0),
  /** approximate, synthetic */
  drive_hours_one_way: z.number().min(0),
  /** optional en-route stop city (has restaurants in the pack) */
  route_stop_city: z.string(),
});
export type Game = z.infer<typeof Game>;

export const Hotel = z.object({
  hotel_id: z.string(),
  city: z.string(),
  name: z.string(),
  address: z.string(),
  phone: z.string(),
  nightly_rate: Money,
  tax_rate: z.number().min(0).max(1),
  rooms_available: Count,
  max_occupancy: z.number().int().min(1),
  miles_to_stadium: z.number().min(0),
  has_meeting_room: z.boolean(),
  has_team_meal_service: z.boolean(),
  /** 0 when has_team_meal_service is false */
  team_meal_price_pp: Money,
});
export type Hotel = z.infer<typeof Hotel>;

export const Restaurant = z.object({
  restaurant_id: z.string(),
  city: z.string(),
  name: z.string(),
  price_per_person: Money,
  capacity: Count,
  miles_to_hotel: z.number().min(0),
  miles_to_stadium: z.number().min(0),
  cuisine: z.string(),
  dietary_options: z.array(Dietary),
  group_friendly: z.boolean(),
  /** true for restaurants in a route-stop city (en-route meals) */
  route_stop: z.boolean(),
});
export type Restaurant = z.infer<typeof Restaurant>;

export const BusCompany = z.object({
  company_id: z.string(),
  name: z.string(),
  phone: z.string(),
  seats_per_bus: z.number().int().min(1),
  daily_rate: Money,
  per_mile_rate: Money,
  driver_room_required_overnight: z.boolean(),
  equipment_truck_daily_rate: Money,
  equipment_truck_per_mile_rate: Money,
});
export type BusCompany = z.infer<typeof BusCompany>;

export const Settings = z.object({
  /** null = use the bus company's seats_per_bus */
  seats_per_bus_override: z.number().int().min(1).nullable(),
  player_room_occupancy: z.number().int().min(1).max(4),
  coach_room_occupancy: z.number().int().min(1).max(4),
  support_room_occupancy: z.number().int().min(1).max(4),
  meal_allowance_per_meal: Money,
  avg_bus_mph: z.number().min(20).max(80),
  departure_buffer_min: z.number().int().min(0),
  min_hours_arrival_before_kickoff: z.number().min(0),
  min_hours_meal_before_kickoff: z.number().min(0),
  latest_hotel_arrival: ClockTime,
  contingency_pct: z.number().min(0).max(50),
  season_travel_budget: Money,
  default_bus_company_id: z.string(),
  roommate_request_deadline_days_before: z.number().int().min(0),
  packing_list: z.array(z.string()),
});
export type Settings = z.infer<typeof Settings>;

export const ActualsEntry = z.object({
  trip_id: z.string(),
  bus: Money,
  equipment: Money,
  hotel: Money,
  meals: Money,
  other: Money,
  notes: z.string(),
  entered_at: z.string(),
});
export type ActualsEntry = z.infer<typeof ActualsEntry>;

/** Every data pack file: `{ synthetic: true, note, data }` */
export const dataFile = <T extends z.ZodType>(inner: T) =>
  z.object({ synthetic: z.literal(true), note: z.string(), data: inner });

export const DataPack = z.object({
  team: Team,
  roster: z.array(Player),
  staff: z.array(StaffMember),
  schedule: z.array(Game),
  hotels: z.array(Hotel),
  restaurants: z.array(Restaurant),
  busRates: z.array(BusCompany),
  settings: Settings,
  actuals: z.array(ActualsEntry),
});
export type DataPack = z.infer<typeof DataPack>;

// ---------- trip request ----------
export const DepartureConstraint = z.object({
  kind: z.enum(['none', 'not_before', 'not_after']),
  /** '' when kind = none */
  datetime_local: z.union([LocalDateTime, z.literal('')]),
  /** what staff typed, for display */
  raw_text: z.string(),
});
export type DepartureConstraint = z.infer<typeof DepartureConstraint>;

export const CapCategory = z.enum(['lodging', 'meals', 'bus', 'total']);
export type CapCategory = z.infer<typeof CapCategory>;
export const Preference = z.enum(['none', 'lowest_cost', 'closest_to_stadium', 'team_meal_service', 'earlier_arrival']);
export type Preference = z.infer<typeof Preference>;

/** A confirmed (staff-reviewed) request. Costs are only computed from this. */
export const TripRequest = z.object({
  game_id: z.string(),
  players: z.number().int().min(1).max(150),
  coaches: z.number().int().min(0).max(40),
  support_staff: z.number().int().min(0).max(60),
  departure_constraint: DepartureConstraint,
  include_equipment_truck: z.boolean(),
  caps: z.object({
    lodging: Money.nullable(),
    meals: Money.nullable(),
    bus: Money.nullable(),
    total: Money.nullable(),
  }),
  excluded_hotel_ids: z.array(z.string()),
  preference: Preference,
  notes: z.string(),
});
export type TripRequest = z.infer<typeof TripRequest>;

export const RequestField = z.enum(['opponent', 'players', 'coaches', 'support_staff', 'departure_constraint', 'include_equipment_truck']);
export type RequestField = z.infer<typeof RequestField>;

/** Output of the parse step, shown to staff for review. Nulls = unknown, must be filled before computing. */
export const TripRequestDraft = z.object({
  game_id: z.string().nullable(),
  opponent_text: z.string(),
  players: z.number().int().nullable(),
  coaches: z.number().int().nullable(),
  support_staff: z.number().int().nullable(),
  departure_constraint: DepartureConstraint,
  include_equipment_truck: z.boolean().nullable(),
  notes: z.string(),
});
export type TripRequestDraft = z.infer<typeof TripRequestDraft>;

export const ParseResult = z.object({
  draft: TripRequestDraft,
  missing_fields: z.array(RequestField),
  ambiguities: z.array(z.object({ field: RequestField, message: z.string() })),
  /** 'ai' normally; 'fallback' when AI is down (everything marked missing) */
  source: z.enum(['ai', 'fallback']),
  notice: z.string(),
});
export type ParseResult = z.infer<typeof ParseResult>;

// ---------- packages / costs ----------
export const ItineraryKind = z.enum([
  'depart', 'stop', 'meal', 'arrive_hotel', 'checkin', 'walkthrough', 'meeting', 'curfew',
  'depart_hotel', 'arrive_stadium', 'kickoff', 'depart_return', 'arrive_home',
]);
export type ItineraryKind = z.infer<typeof ItineraryKind>;

export const ItineraryItem = z.object({
  id: z.string(), // IT-1, IT-2 ...
  kind: ItineraryKind,
  label: z.string(),
  start_local: LocalDateTime,
  end_local: z.union([LocalDateTime, z.literal('')]),
  location: z.string(),
  /** meal items link to MealLine.meal_id */
  meal_id: z.string(),
});
export type ItineraryItem = z.infer<typeof ItineraryItem>;

export const MealKind = z.enum(['en_route_lunch', 'team_dinner', 'breakfast', 'pregame_meal', 'postgame_boxed']);
export type MealKind = z.infer<typeof MealKind>;
export const MealLine = z.object({
  meal_id: z.string(), // ML-1
  kind: MealKind,
  itinerary_item_id: z.string(),
  source: z.enum(['restaurant', 'hotel']),
  /** restaurant_id or hotel_id */
  vendor_id: z.string(),
  vendor_name: z.string(),
  time_local: LocalDateTime,
  headcount: Count,
  price_per_person: Money,
  cost: Money,
  over_allowance: z.boolean(),
  dietary_gaps: z.array(Dietary),
});
export type MealLine = z.infer<typeof MealLine>;

export const CostBreakdown = z.object({
  bus: Money,
  equipment: Money,
  hotel: Money,
  meals: Money,
  subtotal: Money,
  contingency: Money,
  total: Money,
});
export type CostBreakdown = z.infer<typeof CostBreakdown>;

export const RiskCode = z.enum([
  'late_hotel_arrival', 'arrival_close_to_kickoff', 'meal_close_to_kickoff', 'bus_near_capacity',
  'insufficient_rooms', 'meal_over_allowance', 'dietary_gap', 'over_season_share', 'infeasible_departure',
  'over_cap',
]);
export type RiskCode = z.infer<typeof RiskCode>;
export const RiskFlag = z.object({
  code: RiskCode,
  severity: z.enum(['info', 'warning', 'critical']),
  /** plain-language, generated by code */
  message: z.string(),
  option_id: z.string(),
  related_item_id: z.string(),
});
export type RiskFlag = z.infer<typeof RiskFlag>;

export const TravelCounts = z.object({
  players: Count,
  coaches: Count,
  support: Count,
  travelers: Count,
  drivers: Count,
  buses: Count,
  seats_per_bus: Count,
  rooms_players: Count,
  rooms_coaches: Count,
  rooms_support: Count,
  rooms_drivers: Count,
  rooms_total: Count,
});
export type TravelCounts = z.infer<typeof TravelCounts>;

export const PackageTier = z.enum(['A', 'B', 'C']);
export const PackageLabel = z.enum(['Economy', 'Balanced', 'Game-Ready']);
export const TravelPackage = z.object({
  option_id: z.string(), // PKG-G04-A
  game_id: z.string(),
  tier: PackageTier,
  label: PackageLabel,
  feasible: z.boolean(),
  infeasible_reason: z.string(),
  hotel_id: z.string(),
  hotel_name: z.string(),
  bus_company_id: z.string(),
  departure_local: LocalDateTime,
  return_local: LocalDateTime,
  nights: Count,
  trip_days: z.number().int().min(1),
  round_trip_miles: z.number().min(0),
  counts: TravelCounts,
  meals: z.array(MealLine),
  costs: CostBreakdown,
  itinerary: z.array(ItineraryItem),
  risk_flags: z.array(RiskFlag),
});
export type TravelPackage = z.infer<typeof TravelPackage>;

export const FactGuardResult = z.object({
  passed: z.boolean(),
  /** true when the AI prose was replaced with a code template */
  replaced: z.boolean(),
  issues: z.array(z.string()),
});
export type FactGuardResult = z.infer<typeof FactGuardResult>;

export const Recommendation = z.object({
  recommended_option_id: z.string(),
  ranking: z.array(z.string()),
  tradeoffs: z.array(z.object({ option_id: z.string(), pros: z.array(z.string()), cons: z.array(z.string()) })),
  explanation: z.string(),
  source: z.enum(['ai', 'template']),
  fact_guard: FactGuardResult,
  created_at: z.string(),
});
export type Recommendation = z.infer<typeof Recommendation>;

// ---------- what-if ----------
export const CountField = z.enum(['players', 'coaches', 'support_staff']);
export const PatchOp = z.discriminatedUnion('op', [
  z.object({ op: z.literal('set_count'), field: CountField, value: z.number().int() }),
  z.object({ op: z.literal('adjust_count'), field: CountField, delta: z.number().int() }),
  z.object({ op: z.literal('set_cap'), category: CapCategory, max: Money }),
  z.object({ op: z.literal('clear_cap'), category: CapCategory }),
  z.object({ op: z.literal('set_departure_constraint'), constraint: DepartureConstraint }),
  z.object({ op: z.literal('exclude_hotel'), hotel_id: z.string() }),
  z.object({ op: z.literal('set_equipment_truck'), value: z.boolean() }),
  z.object({ op: z.literal('prefer'), criterion: Preference }),
]);
export type PatchOp = z.infer<typeof PatchOp>;

export const ChatTurn = z.object({ role: z.enum(['user', 'assistant']), content: z.string() });
export type ChatTurn = z.infer<typeof ChatTurn>;

export const PackageDiff = z.object({
  option_id: z.string(),
  before_total: Money.nullable(),
  after_total: Money.nullable(),
  delta: Money,
  changes: z.array(z.string()),
});
export type PackageDiff = z.infer<typeof PackageDiff>;

// ---------- rooming ----------
export const Room = z.object({
  room_id: z.string(),
  kind: z.enum(['player', 'coach', 'support', 'driver']),
  occupant_ids: z.array(z.string()),
});
export type Room = z.infer<typeof Room>;
export const Rooming = z.object({
  trip_id: z.string(),
  generated_at: z.string(),
  rooms: z.array(Room),
  requests_honored: Count,
  requests_total: Count,
  /** staff swapped by hand after generation */
  edited: z.boolean(),
});
export type Rooming = z.infer<typeof Rooming>;
export const RoommateRequest = z.object({
  athlete_id: z.string(),
  trip_id: z.string(),
  requested_ids: z.array(z.string()).max(2),
  updated_at: z.string(),
});
export type RoommateRequest = z.infer<typeof RoommateRequest>;

export const BusAssignment = z.object({ bus_number: z.number().int().min(1), traveler_ids: z.array(z.string()) });
export type BusAssignment = z.infer<typeof BusAssignment>;

// ---------- trip ----------
export const TripStatus = z.enum(['not_started', 'draft', 'approved', 'published', 'completed']);
export type TripStatus = z.infer<typeof TripStatus>;

export const Memo = z.object({
  markdown: z.string(),
  generated_at: z.string(),
  option_id: z.string(),
  unverified_sentences: z.array(z.string()),
});
export type Memo = z.infer<typeof Memo>;

export const Trip = z.object({
  trip_id: z.string(), // TRIP-G04
  game_id: z.string(),
  status: TripStatus,
  request: TripRequest.nullable(),
  packages: z.array(TravelPackage),
  selected_option_id: z.string().nullable(),
  recommendation: Recommendation.nullable(),
  whatif_history: z.array(ChatTurn),
  memo: Memo.nullable(),
  traveling_player_ids: z.array(z.string()),
  traveling_staff_ids: z.array(z.string()),
  rooming: Rooming.nullable(),
  buses: z.array(BusAssignment),
  roommate_deadline_local: z.union([LocalDateTime, z.literal('')]),
  published_version: Count,
  published_at: z.string(),
  share_token: z.string(),
  updated_at: z.string(),
});
export type Trip = z.infer<typeof Trip>;

/** Compact list row */
export const TripSummary = z.object({
  trip_id: z.string(),
  game_id: z.string(),
  opponent: z.string(),
  city: z.string(),
  state: z.string(),
  date: IsoDate,
  kickoff_local: ClockTime,
  status: TripStatus,
  selected_option_id: z.string().nullable(),
  selected_label: z.string(),
  estimated_total: Money.nullable(),
  risk_count: Count,
});
export type TripSummary = z.infer<typeof TripSummary>;

/** Full trip + its game, as returned by GET /trips/:id */
export const TripDetail = z.object({ trip: Trip, game: Game });
export type TripDetail = z.infer<typeof TripDetail>;

// ---------- athlete view / versions / notifications ----------
export const AthleteTripView = z.object({
  trip_id: z.string(),
  version: Count,
  athlete_id: z.string(),
  game: Game,
  hotel: z.object({ hotel_id: z.string(), name: z.string(), address: z.string(), phone: z.string() }),
  bus_number: z.number().int().nullable(),
  room_id: z.string().nullable(),
  roommates: z.array(z.object({ id: z.string(), name: z.string() })),
  itinerary: z.array(ItineraryItem),
  meals: z.array(z.object({ meal_id: z.string(), kind: MealKind, time_local: LocalDateTime, vendor_name: z.string(), itinerary_item_id: z.string() })),
  packing_list: z.array(z.string()),
  departure_local: LocalDateTime,
  roommate_deadline_local: z.union([LocalDateTime, z.literal('')]),
  published_at: z.string(),
  share_url: z.string(),
});
export type AthleteTripView = z.infer<typeof AthleteTripView>;

export const MyTripResponse = z.object({
  athlete: z.object({ id: z.string(), name: z.string(), jersey: z.number().int(), position: z.string() }),
  /** null when no published trip includes this athlete */
  trip: AthleteTripView.nullable(),
  /** upcoming trips this athlete is on the travel roster for, where roommate requests are open */
  open_roommate_requests: z.array(z.object({ trip_id: z.string(), opponent: z.string(), deadline_local: z.string() })),
});
export type MyTripResponse = z.infer<typeof MyTripResponse>;

export const ChangeItem = z.object({
  kind: z.enum(['time', 'hotel', 'bus', 'roommate', 'meal', 'added', 'removed']),
  item_id: z.string(),
  label: z.string(),
  before: z.string(),
  after: z.string(),
});
export type ChangeItem = z.infer<typeof ChangeItem>;

export const AthleteNotification = z.object({
  id: z.string(),
  athlete_id: z.string(),
  trip_id: z.string(),
  version: Count,
  created_at: z.string(),
  title: z.string(),
  /** plain words, generated by code from the diff */
  body: z.string(),
  changes: z.array(ChangeItem),
  read: z.boolean(),
});
export type AthleteNotification = z.infer<typeof AthleteNotification>;

export const Fact = z.object({ id: z.string(), text: z.string() });
export type Fact = z.infer<typeof Fact>;
export const AssistantReply = z.object({
  answer: z.string(),
  cited_fact_ids: z.array(z.string()),
  /** resolved citations so the app can render chips */
  citations: z.array(Fact),
  needs_staff: z.boolean(),
  source: z.enum(['ai', 'fallback']),
  fact_guard: FactGuardResult,
});
export type AssistantReply = z.infer<typeof AssistantReply>;

// ---------- season ----------
export const SeasonRow = z.object({
  trip_id: z.string(),
  game_id: z.string(),
  opponent: z.string(),
  date: IsoDate,
  status: TripStatus,
  selected_option_id: z.string().nullable(),
  selected_label: z.string(),
  /** selected package total, or cheapest feasible for drafts with nothing selected; null if not computed */
  planned_cost: Money.nullable(),
  actual_cost: Money.nullable(),
  /** actual - planned for completed trips */
  variance: Money.nullable(),
  risk_count: Count,
  counts_toward: z.enum(['committed', 'projected', 'none']),
});
export type SeasonRow = z.infer<typeof SeasonRow>;

export const SeasonRollup = z.object({
  budget: Money,
  /** approved + published + completed (completed uses actual when entered) */
  committed: Money,
  /** committed + drafts */
  projected: Money,
  remaining: Money,
  over_budget: z.boolean(),
  rows: z.array(SeasonRow),
  actuals: z.object({ trips_completed: Count, planned_total: Money, actual_total: Money, variance: Money }),
});
export type SeasonRollup = z.infer<typeof SeasonRollup>;

export const SavingsCandidate = z.object({
  candidate_id: z.string(), // SAV-1
  kind: z.enum(['switch_package', 'reduce_travelers', 'cheaper_hotel']),
  trip_id: z.string(),
  description: z.string(),
  savings: Money,
  /** the package that would be selected, when applicable */
  new_option_id: z.string(),
});
export type SavingsCandidate = z.infer<typeof SavingsCandidate>;

export const SavingsResult = z.object({
  candidates: z.array(SavingsCandidate),
  selected_candidate_ids: z.array(z.string()),
  explanation: z.string(),
  projected_before: Money,
  projected_after: Money,
  total_savings: Money,
  back_under_budget: z.boolean(),
  source: z.enum(['ai', 'template']),
  fact_guard: FactGuardResult,
});
export type SavingsResult = z.infer<typeof SavingsResult>;

// ---------- actuals ----------
export const ActualsInput = ActualsEntry.omit({ trip_id: true, entered_at: true });
export type ActualsInput = z.infer<typeof ActualsInput>;
export const BudgetVsActual = z.object({
  trip_id: z.string(),
  option_id: z.string(),
  lines: z.array(z.object({ category: z.enum(['bus', 'equipment', 'hotel', 'meals', 'other', 'contingency']), planned: Money, actual: Money.nullable(), variance: Money.nullable() })),
  planned_total: Money,
  actual_total: Money.nullable(),
  variance_total: Money.nullable(),
});
export type BudgetVsActual = z.infer<typeof BudgetVsActual>;

// ---------- packets ----------
export const Packet = z.object({
  trip_id: z.string(),
  audience: z.enum(['staff', 'athlete']),
  title: z.string(),
  /** self-contained printable HTML (used by expo-print and the share page) */
  html: z.string(),
  share_url: z.string(),
});
export type Packet = z.infer<typeof Packet>;

// ---------- AI observability ----------
export const AiFeature = z.enum(['parse', 'recommend', 'whatif', 'memo', 'savings', 'assistant', 'dev']);
export type AiFeature = z.infer<typeof AiFeature>;
export const AiCallLog = z.object({
  id: z.number().int(),
  feature: AiFeature,
  endpoint: z.enum(['generate', 'stream']),
  ok: z.boolean(),
  error_code: z.string(),
  input_tokens: Count,
  cached_tokens: Count,
  output_tokens: Count,
  credits: z.number(),
  latency_ms: Count,
  request_id: z.string(),
  attempts: Count,
  mock: z.boolean(),
  created_at: z.string(),
});
export type AiCallLog = z.infer<typeof AiCallLog>;

export const AiUsageSummary = z.object({
  totals: z.object({ calls: Count, errors: Count, input_tokens: Count, output_tokens: Count, credits: z.number(), avg_latency_ms: Count }),
  by_feature: z.array(z.object({ feature: AiFeature, calls: Count, input_tokens: Count, output_tokens: Count, credits: z.number(), avg_input_tokens: Count })),
  recent: z.array(AiCallLog),
  mock_mode: z.boolean(),
});
export type AiUsageSummary = z.infer<typeof AiUsageSummary>;

export const AccuracyReport = z.object({
  run_at: z.string(),
  mock: z.boolean(),
  cases_run: Count,
  per_field: z.array(z.object({ field: z.string(), correct: Count, total: Count, accuracy: z.number() })),
  overall_accuracy: z.number(),
  exact_match_rate: z.number(),
  recommendation_valid_id_rate: z.number(),
  fact_guard_pass_rate: z.number(),
  failures: z.array(z.object({ case_id: z.string(), field: z.string(), expected: z.string(), got: z.string() })),
});
export type AccuracyReport = z.infer<typeof AccuracyReport>;

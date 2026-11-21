/**
 * What-if patching — task A-07.
 *  - aiOpsToPatch: flattened AI ops (sentinels) → typed PatchOp[] + rejected (with reasons)
 *  - applyPatch: validate & apply to a TripRequest (clamp nothing silently — reject out-of-range values)
 *  - diffPackages: before/after per option_id (total delta + human-readable changes by code)
 * The model only proposes ops; every number shown afterwards is recomputed by code.
 */
import type { CapCategory, DepartureConstraint, Game, PackageDiff, PatchOp, TravelPackage, TripRequest } from '../domain';
import type { AiWhatIfOut } from '../ai/schemas';
import type { PlanningData } from './types';
import { formatUSD, round2 } from './money';
import { addDays, combine, formatDayTime, isBefore, isValidClock, resolveDay } from './time';

export interface Rejected { op: unknown; reason: string }
type AiOp = AiWhatIfOut['patch_ops'][number];
type CountField = 'players' | 'coaches' | 'support_staff';

/** How far before the game a departure constraint may point (days). Shared by submitRequest and what-if. */
export const CONSTRAINT_WINDOW_DAYS = 3;

/** null if the constraint is usable for this game, else a human-readable reason. */
export function constraintIssue(c: DepartureConstraint, game: Game): string | null {
  if (c.kind === 'none') return null;
  if (!c.datetime_local) return 'Departure constraint needs a day and time (or set it to none)';
  const earliest = combine(addDays(game.date, -CONSTRAINT_WINDOW_DAYS), '00:00');
  const kickoff = combine(game.date, game.kickoff_local);
  if (isBefore(c.datetime_local, earliest) || isBefore(kickoff, c.datetime_local)) {
    return `Departure constraint must be between ${formatDayTime(earliest)} and kickoff (${formatDayTime(kickoff)})`;
  }
  return null;
}

export const eligiblePlayerCount = (data: Pick<PlanningData, 'roster'>) => data.roster.filter((p) => p.travel_eligible).length;

/** Inclusive bounds per count field (TripRequest schema + eligible players). */
export function countBounds(field: CountField, data: Pick<PlanningData, 'roster'>): [number, number] {
  if (field === 'players') return [1, Math.min(150, eligiblePlayerCount(data))];
  if (field === 'coaches') return [0, 40];
  return [0, 60];
}

const FIELD_LABEL: Record<CountField, string> = { players: 'Players', coaches: 'Coaches', support_staff: 'Support staff' };
const CAP_LABEL: Record<CapCategory, string> = { lodging: 'Lodging', meals: 'Meals', bus: 'Bus', total: 'Total' };

export function aiOpsToPatch(ops: AiWhatIfOut['patch_ops'], ctx: { game: Game; data: PlanningData }): { ops: PatchOp[]; rejected: Rejected[] } {
  const out: PatchOp[] = [];
  const rejected: Rejected[] = [];
  const reject = (op: AiOp, reason: string) => rejected.push({ op, reason });

  for (const op of ops) {
    switch (op.op) {
      case 'set_count':
        if (op.field === '' || op.value < 0) reject(op, 'set_count needs a field and a value of 0 or more');
        else out.push({ op: 'set_count', field: op.field, value: op.value });
        break;
      case 'adjust_count':
        if (op.field === '' || op.delta === 0) reject(op, 'adjust_count needs a field and a non-zero change');
        else out.push({ op: 'adjust_count', field: op.field, delta: op.delta });
        break;
      case 'set_cap':
        if (op.category === '' || !(op.max > 0)) reject(op, 'set_cap needs a category and an amount above $0');
        else out.push({ op: 'set_cap', category: op.category, max: round2(op.max) });
        break;
      case 'clear_cap':
        if (op.category === '') reject(op, 'clear_cap needs a category');
        else out.push({ op: 'clear_cap', category: op.category });
        break;
      case 'set_departure_constraint': {
        if (op.constraint_kind === '') { reject(op, 'set_departure_constraint needs a kind'); break; }
        if (op.constraint_kind === 'none') {
          out.push({ op: 'set_departure_constraint', constraint: { kind: 'none', datetime_local: '', raw_text: '' } });
          break;
        }
        const day = op.constraint_day === '' ? null : resolveDay(ctx.game.date, op.constraint_day);
        if (!day) { reject(op, 'Departure day is missing or not understood'); break; }
        if (!isValidClock(op.constraint_time_24h)) { reject(op, `Departure time "${op.constraint_time_24h}" is not a valid HH:MM time`); break; }
        const datetime_local = combine(day, op.constraint_time_24h);
        const raw_text = `${op.constraint_kind === 'not_before' ? 'Not before' : 'Not after'} ${formatDayTime(datetime_local)}`;
        out.push({ op: 'set_departure_constraint', constraint: { kind: op.constraint_kind, datetime_local, raw_text } });
        break;
      }
      case 'exclude_hotel': {
        const h = ctx.data.hotels.find((x) => x.hotel_id === op.hotel_id);
        if (!h || h.city !== ctx.game.city) reject(op, `Hotel "${op.hotel_id}" is not a ${ctx.game.city} hotel`);
        else out.push({ op: 'exclude_hotel', hotel_id: h.hotel_id });
        break;
      }
      case 'set_equipment_truck':
        if (op.bool_value === '') reject(op, 'set_equipment_truck needs yes or no');
        else out.push({ op: 'set_equipment_truck', value: op.bool_value === 'yes' });
        break;
      case 'prefer':
        if (op.criterion === 'none') reject(op, 'prefer needs a criterion');
        else out.push({ op: 'prefer', criterion: op.criterion });
        break;
      default:
        reject(op, 'Unknown operation');
    }
  }
  return { ops: out, rejected };
}

export function applyPatch(req: TripRequest, ops: PatchOp[], ctx: { game: Game; data: PlanningData }): { request: TripRequest; rejected: Rejected[] } {
  const r: TripRequest = { ...req, caps: { ...req.caps }, excluded_hotel_ids: [...req.excluded_hotel_ids], departure_constraint: { ...req.departure_constraint } };
  const rejected: Rejected[] = [];

  const setCount = (op: PatchOp, field: CountField, next: number) => {
    const [lo, hi] = countBounds(field, ctx.data);
    if (!Number.isInteger(next) || next < lo || next > hi) {
      const why = field === 'players' && next > hi && hi === eligiblePlayerCount(ctx.data) ? ` (only ${hi} players are travel-eligible)` : '';
      rejected.push({ op, reason: `${FIELD_LABEL[field]} would be ${next}; allowed ${lo}–${hi}${why}` });
      return;
    }
    r[field] = next;
  };

  for (const op of ops) {
    switch (op.op) {
      case 'set_count':
        setCount(op, op.field, op.value);
        break;
      case 'adjust_count':
        setCount(op, op.field, r[op.field] + op.delta);
        break;
      case 'set_cap':
        if (!(op.max > 0)) rejected.push({ op, reason: 'Cap must be above $0' });
        else r.caps[op.category] = op.max;
        break;
      case 'clear_cap':
        r.caps[op.category] = null;
        break;
      case 'set_departure_constraint': {
        const issue = constraintIssue(op.constraint, ctx.game);
        if (issue) rejected.push({ op, reason: issue });
        else r.departure_constraint = { ...op.constraint };
        break;
      }
      case 'exclude_hotel': {
        const city = ctx.data.hotels.filter((h) => h.city === ctx.game.city).map((h) => h.hotel_id);
        if (!city.includes(op.hotel_id)) rejected.push({ op, reason: `Hotel "${op.hotel_id}" is not a ${ctx.game.city} hotel` });
        else if (r.excluded_hotel_ids.includes(op.hotel_id)) rejected.push({ op, reason: `${op.hotel_id} is already excluded` });
        else if (city.every((id) => id === op.hotel_id || r.excluded_hotel_ids.includes(id))) {
          rejected.push({ op, reason: `Can't exclude every hotel in ${ctx.game.city}` });
        } else r.excluded_hotel_ids.push(op.hotel_id);
        break;
      }
      case 'set_equipment_truck':
        r.include_equipment_truck = op.value;
        break;
      case 'prefer':
        r.preference = op.criterion;
        break;
    }
  }
  return { request: r, rejected };
}

/** Short code-written description of an applied op (used when the AI reply fails the fact guard). */
export function describeOp(op: PatchOp): string {
  switch (op.op) {
    case 'set_count': return `${FIELD_LABEL[op.field]} set to ${op.value}`;
    case 'adjust_count': return `${FIELD_LABEL[op.field]} ${op.delta > 0 ? '+' : '−'}${Math.abs(op.delta)}`;
    case 'set_cap': return `${CAP_LABEL[op.category]} cap set to ${formatUSD(op.max)}`;
    case 'clear_cap': return `${CAP_LABEL[op.category]} cap removed`;
    case 'set_departure_constraint': return op.constraint.kind === 'none' ? 'Departure limit removed' : op.constraint.raw_text;
    case 'exclude_hotel': return `Excluded ${op.hotel_id}`;
    case 'set_equipment_truck': return op.value ? 'Equipment truck added' : 'Equipment truck removed';
    case 'prefer': return `Preference: ${op.criterion.replaceAll('_', ' ')}`;
  }
}

export function diffPackages(before: TravelPackage[], after: TravelPackage[]): PackageDiff[] {
  const ids = [...new Set([...after.map((p) => p.option_id), ...before.map((p) => p.option_id)])];
  return ids.map((option_id) => {
    const b = before.find((p) => p.option_id === option_id) ?? null;
    const a = after.find((p) => p.option_id === option_id) ?? null;
    const before_total = b?.costs.total ?? null;
    const after_total = a?.costs.total ?? null;
    const delta = round2((after_total ?? 0) - (before_total ?? 0));
    const changes: string[] = [];
    if (!b && a) changes.push('New option');
    else if (b && !a) changes.push('Option no longer offered');
    else if (a && b) {
      const arrow = (label: string, x: number, y: number) => `${label} ${x} → ${y}`;
      if (a.counts.players !== b.counts.players) changes.push(arrow('Players', b.counts.players, a.counts.players));
      if (a.counts.coaches !== b.counts.coaches) changes.push(arrow('Coaches', b.counts.coaches, a.counts.coaches));
      if (a.counts.support !== b.counts.support) changes.push(arrow('Support staff', b.counts.support, a.counts.support));
      changes.push(arrow('Rooms', b.counts.rooms_total, a.counts.rooms_total));
      changes.push(arrow('Buses', b.counts.buses, a.counts.buses));
      if (a.hotel_id !== b.hotel_id) changes.push(`Hotel ${b.hotel_name || 'none'} → ${a.hotel_name || 'none'}`);
      if (a.departure_local !== b.departure_local) changes.push(`Departure ${formatDayTime(b.departure_local)} → ${formatDayTime(a.departure_local)}`);
      if (a.costs.equipment !== b.costs.equipment) changes.push(`Equipment ${formatUSD(b.costs.equipment)} → ${formatUSD(a.costs.equipment)}`);
      changes.push(`Total ${formatUSD(b.costs.total)} → ${formatUSD(a.costs.total)}`);
      if (b.feasible && !a.feasible) changes.push(`Now infeasible: ${a.infeasible_reason}`);
      if (!b.feasible && a.feasible) changes.push('Now feasible');
    }
    return { option_id, before_total, after_total, delta, changes };
  });
}

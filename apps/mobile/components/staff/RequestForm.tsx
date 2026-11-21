/**
 * Trip request form (B-03). Reused by the free-text review (B-04). Never touches AI.
 * Client validation mirrors the server bounds in TripRequest (domain.ts).
 */
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  addDays, combine, datePart, clockPart, formatDayTime, isValidClock, minutesOfDay, resolveDay,
  type DepartureConstraint, type Game, type RequestField, type TripRequest,
} from '@falcon/shared';
import { Banner, Button, Caption, Card, Field, NumberStepper, Row, Segmented, SelectChip, ToggleRow } from '../ui';
import { colors, font, radius, TAP } from '../../lib/theme';

export type DayKey = 'two_days_before' | 'day_before' | 'game_day';
const DAY_OPTIONS: { key: DayKey; label: string }[] = [
  { key: 'two_days_before', label: '2 days before' },
  { key: 'day_before', label: 'Day before' },
  { key: 'game_day', label: 'Game day' },
];

export interface RequestDraft {
  players: number | null;
  coaches: number | null;
  support_staff: number | null;
  constraintKind: DepartureConstraint['kind'];
  constraintDay: DayKey;
  constraintTime: string;
  /** raw text from the parse (kept when the constraint isn't edited) */
  constraintRaw: string;
  include_equipment_truck: boolean | null;
  notes: string;
}

export const DEFAULT_DRAFT: RequestDraft = {
  players: 70, coaches: 12, support_staff: 12,
  constraintKind: 'none', constraintDay: 'day_before', constraintTime: '14:00', constraintRaw: '',
  include_equipment_truck: true, notes: '',
};

/** Map a departure constraint back to day chip + clock. */
export function constraintToDraft(c: DepartureConstraint, gameDate: string): Pick<RequestDraft, 'constraintKind' | 'constraintDay' | 'constraintTime' | 'constraintRaw'> {
  if (c.kind === 'none' || !c.datetime_local) {
    return { constraintKind: c.kind === 'none' ? 'none' : c.kind, constraintDay: 'day_before', constraintTime: '14:00', constraintRaw: c.raw_text };
  }
  const d = datePart(c.datetime_local);
  const day: DayKey = d === gameDate ? 'game_day' : d === addDays(gameDate, -2) ? 'two_days_before' : 'day_before';
  return { constraintKind: c.kind, constraintDay: day, constraintTime: clockPart(c.datetime_local), constraintRaw: c.raw_text };
}

/** Existing request → draft (for editing a submitted trip). */
export function requestToDraft(r: TripRequest, gameDate: string): RequestDraft {
  return {
    players: r.players, coaches: r.coaches, support_staff: r.support_staff,
    ...constraintToDraft(r.departure_constraint, gameDate),
    include_equipment_truck: r.include_equipment_truck, notes: r.notes,
  };
}

const shiftClock = (clock: string, delta: number) => {
  const base = isValidClock(clock) ? minutesOfDay(clock) : 14 * 60;
  const m = (((base + delta) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

type Errors = Partial<Record<'players' | 'coaches' | 'support_staff' | 'time' | 'truck', string>>;

export function validateDraft(d: RequestDraft): Errors {
  const e: Errors = {};
  const range = (v: number | null, min: number, max: number, what: string) =>
    v == null ? `Enter the number of ${what}` : v < min || v > max ? `${what[0]!.toUpperCase()}${what.slice(1)} must be ${min}–${max}` : undefined;
  const p = range(d.players, 1, 150, 'players');
  const c = range(d.coaches, 0, 40, 'coaches');
  const s = range(d.support_staff, 0, 60, 'support staff');
  if (p) e.players = p;
  if (c) e.coaches = c;
  if (s) e.support_staff = s;
  if (d.constraintKind !== 'none' && !isValidClock(d.constraintTime)) e.time = 'Enter a time as HH:MM (24-hour), e.g. 14:00';
  if (d.include_equipment_truck == null) e.truck = 'Choose whether the equipment truck comes';
  return e;
}

export function draftToRequest(d: RequestDraft, game: Game, base: TripRequest | null): TripRequest {
  let constraint: DepartureConstraint = { kind: 'none', datetime_local: '', raw_text: '' };
  if (d.constraintKind !== 'none') {
    const date = resolveDay(game.date, d.constraintDay) ?? game.date;
    const ldt = combine(date, d.constraintTime);
    const words = `${d.constraintKind === 'not_before' ? 'Not before' : 'Not after'} ${formatDayTime(ldt)}`;
    constraint = { kind: d.constraintKind, datetime_local: ldt, raw_text: d.constraintRaw || words };
  }
  return {
    game_id: game.game_id,
    players: d.players ?? 0,
    coaches: d.coaches ?? 0,
    support_staff: d.support_staff ?? 0,
    departure_constraint: constraint,
    include_equipment_truck: d.include_equipment_truck ?? false,
    // keep what-if adjustments (caps / excluded hotels / preference) from the existing request
    caps: base?.caps ?? { lodging: null, meals: null, bus: null, total: null },
    excluded_hotel_ids: base?.excluded_hotel_ids ?? [],
    preference: base?.preference ?? 'none',
    notes: d.notes.trim(),
  };
}

export function RequestForm({ game, initial, missing = [], onSubmit, submitting, base = null, submitLabel = 'Compute packages', serverError, ambiguities = [] }: {
  game: Game;
  initial: Partial<RequestDraft>;
  missing?: (RequestField | string)[];
  onSubmit: (req: TripRequest) => void;
  submitting?: boolean;
  /** existing request whose caps / exclusions / preference are kept */
  base?: TripRequest | null;
  submitLabel?: string;
  serverError?: string | null;
  /** per-field warnings from the parse (B-04) */
  ambiguities?: { field: string; message: string }[];
}) {
  const [d, setD] = useState<RequestDraft>({ ...DEFAULT_DRAFT, ...initial });
  // fields the parse flagged as missing stay highlighted until staff touch them
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [showErrors, setShowErrors] = useState(false);
  const set = <K extends keyof RequestDraft>(k: K, v: RequestDraft[K], field?: string) => {
    setD((prev) => ({ ...prev, [k]: v, ...(k.startsWith('constraint') && k !== 'constraintRaw' ? { constraintRaw: '' } : {}) }));
    if (field) setTouched((t) => new Set(t).add(field));
  };
  const errors = useMemo(() => validateDraft(d), [d]);
  const valid = Object.keys(errors).length === 0;
  const hl = (f: string) => missing.includes(f) && !touched.has(f);
  const amb = (f: string) => ambiguities.filter((a) => a.field === f);
  const err = (k: keyof Errors) => (showErrors || touched.size > 0 ? errors[k] : undefined) ?? null;

  const resolvedDate = resolveDay(game.date, d.constraintDay) ?? game.date;
  const resolved = d.constraintKind !== 'none' && isValidClock(d.constraintTime)
    ? `${d.constraintKind === 'not_before' ? 'Not before' : 'Not after'} ${formatDayTime(combine(resolvedDate, d.constraintTime))}`
    : '';

  const submit = () => {
    setShowErrors(true);
    if (!valid) return;
    onSubmit(draftToRequest(d, game, base));
  };

  return (
    <View style={{ gap: 14 }}>
      <Card>
        <Text style={{ fontSize: font.lg, fontWeight: '800', color: colors.brown }}>Who travels</Text>
        <NumberStepper label="Players (1–150)" value={d.players} min={1} max={150} onChange={(v) => set('players', v, 'players')} highlight={hl('players')} error={err('players')} />
        {amb('players').map((a, i) => <Caption key={i} tone="warn">⚠ {a.message}</Caption>)}
        <NumberStepper label="Coaches (0–40)" value={d.coaches} min={0} max={40} onChange={(v) => set('coaches', v, 'coaches')} highlight={hl('coaches')} error={err('coaches')} />
        {amb('coaches').map((a, i) => <Caption key={i} tone="warn">⚠ {a.message}</Caption>)}
        <NumberStepper label="Support staff (0–60)" value={d.support_staff} min={0} max={60} onChange={(v) => set('support_staff', v, 'support_staff')} highlight={hl('support_staff')} error={err('support_staff')} />
        {amb('support_staff').map((a, i) => <Caption key={i} tone="warn">⚠ {a.message}</Caption>)}
      </Card>

      <Card style={hl('departure_constraint') ? { borderColor: colors.orange, borderWidth: 2 } : undefined}>
        <Text style={{ fontSize: font.lg, fontWeight: '800', color: colors.brown }}>Departure limit</Text>
        {hl('departure_constraint') && <Text style={{ color: colors.orange, fontWeight: '700' }}>Please fill in (choose None if there is no limit)</Text>}
        {amb('departure_constraint').map((a, i) => <Caption key={i} tone="warn">⚠ {a.message}</Caption>)}
        <Segmented
          accessibilityLabel="Departure limit"
          value={d.constraintKind}
          onChange={(v) => set('constraintKind', v, 'departure_constraint')}
          options={[{ value: 'none', label: 'None' }, { value: 'not_before', label: 'Not before' }, { value: 'not_after', label: 'Not after' }]}
        />
        {d.constraintKind !== 'none' && (
          <View style={{ gap: 10 }}>
            <Row>
              {DAY_OPTIONS.map((o) => (
                <SelectChip key={o.key} label={o.label} selected={d.constraintDay === o.key} onPress={() => set('constraintDay', o.key, 'departure_constraint')} />
              ))}
            </Row>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
              <TimeNudge label="−15 min" onPress={() => set('constraintTime', shiftClock(d.constraintTime, -15), 'departure_constraint')} />
              <View style={{ flex: 1 }}>
                <Field
                  label="Time (24-hour HH:MM)"
                  value={d.constraintTime}
                  onChangeText={(t) => set('constraintTime', t.replace(/[^0-9:]/g, '').slice(0, 5), 'departure_constraint')}
                  keyboardType="numbers-and-punctuation"
                  placeholder="14:00"
                  error={err('time')}
                />
              </View>
              <TimeNudge label="+15 min" onPress={() => set('constraintTime', shiftClock(d.constraintTime, 15), 'departure_constraint')} />
            </View>
            {resolved ? (
              <Text accessibilityLiveRegion="polite" style={{ fontSize: font.md, fontWeight: '700', color: colors.info }}>{resolved}</Text>
            ) : null}
          </View>
        )}
      </Card>

      <Card>
        <ToggleRow
          label="Bring the equipment truck"
          hint="Adds the truck's daily + mileage cost"
          value={d.include_equipment_truck ?? false}
          onChange={(v) => set('include_equipment_truck', v, 'include_equipment_truck')}
          highlight={hl('include_equipment_truck')}
        />
        {amb('include_equipment_truck').map((a, i) => <Caption key={i} tone="warn">⚠ {a.message}</Caption>)}
        <Field label="Notes (optional)" value={d.notes} onChangeText={(t) => set('notes', t)} multiline placeholder="Anything staff should remember" />
      </Card>

      {serverError ? <Banner tone="danger" message={serverError} /> : null}
      {showErrors && !valid ? <Banner tone="danger" message={`Please fix: ${Object.values(errors).join(' · ')}`} /> : null}
      <Button
        title={submitLabel}
        onPress={submit}
        loading={submitting}
        disabled={!valid}
        accessibilityHint={valid ? 'Computes three travel packages with code' : `Disabled: ${Object.values(errors).join('. ')}`}
      />
      {!valid ? <Caption tone="warn">{Object.values(errors)[0]}</Caption> : null}
    </View>
  );
}

function TimeNudge({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({ height: TAP, paddingHorizontal: 10, borderRadius: radius.md, backgroundColor: colors.brownSoft, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
    >
      <Text style={{ color: colors.brown, fontWeight: '700', fontSize: font.sm }}>{label}</Text>
    </Pressable>
  );
}

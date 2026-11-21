/** Settings (B-07): every setting editable, validated with the shared Zod schema; reset demo data. */
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { ESTIMATE_NOTE, Settings, isValidClock } from '@falcon/shared';
import { AiNotice, Banner, Button, Caption, Card, ErrorState, Field, Loading, NumberStepper, Row, Screen, SelectChip, ToggleRow } from '../../components/ui';
import { Section } from '../../components/staff/Section';
import { errorMessage } from '../../lib/api';
import { useResetDemo, useSaveSettings, useSettings } from '../../lib/staff/queries';
import { colors, font, radius, space, TAP } from '../../lib/theme';

const NUM_FIELDS = [
  'seats_per_bus_override', 'meal_allowance_per_meal', 'avg_bus_mph', 'departure_buffer_min',
  'min_hours_arrival_before_kickoff', 'min_hours_meal_before_kickoff', 'contingency_pct', 'season_travel_budget',
  'roommate_request_deadline_days_before',
] as const;
type NumField = (typeof NUM_FIELDS)[number];

interface Form {
  nums: Record<NumField, string>;
  useCompanySeats: boolean;
  player_room_occupancy: number | null;
  coach_room_occupancy: number | null;
  support_room_occupancy: number | null;
  latest_hotel_arrival: string;
  default_bus_company_id: string;
  packing_list: string[];
}

const BUS_COMPANIES = ['BUS-1', 'BUS-2', 'BUS-3'];

function toForm(s: Settings): Form {
  const nums = {} as Record<NumField, string>;
  for (const k of NUM_FIELDS) nums[k] = s[k] == null ? '' : String(s[k]);
  if (s.seats_per_bus_override == null) nums.seats_per_bus_override = '56';
  return {
    nums,
    useCompanySeats: s.seats_per_bus_override == null,
    player_room_occupancy: s.player_room_occupancy,
    coach_room_occupancy: s.coach_room_occupancy,
    support_room_occupancy: s.support_room_occupancy,
    latest_hotel_arrival: s.latest_hotel_arrival,
    default_bus_company_id: s.default_bus_company_id,
    packing_list: [...s.packing_list],
  };
}

const num = (t: string) => (t.trim() === '' ? Number.NaN : Number(t));

/** Build a Settings candidate + per-field errors (shared Zod schema, plus "≥ 0" for money). */
function fromForm(f: Form): { value: Settings | null; errors: Record<string, string> } {
  const candidate = {
    seats_per_bus_override: f.useCompanySeats ? null : num(f.nums.seats_per_bus_override),
    player_room_occupancy: f.player_room_occupancy ?? Number.NaN,
    coach_room_occupancy: f.coach_room_occupancy ?? Number.NaN,
    support_room_occupancy: f.support_room_occupancy ?? Number.NaN,
    meal_allowance_per_meal: num(f.nums.meal_allowance_per_meal),
    avg_bus_mph: num(f.nums.avg_bus_mph),
    departure_buffer_min: num(f.nums.departure_buffer_min),
    min_hours_arrival_before_kickoff: num(f.nums.min_hours_arrival_before_kickoff),
    min_hours_meal_before_kickoff: num(f.nums.min_hours_meal_before_kickoff),
    latest_hotel_arrival: f.latest_hotel_arrival,
    contingency_pct: num(f.nums.contingency_pct),
    season_travel_budget: num(f.nums.season_travel_budget),
    default_bus_company_id: f.default_bus_company_id,
    roommate_request_deadline_days_before: num(f.nums.roommate_request_deadline_days_before),
    packing_list: f.packing_list.map((p) => p.trim()).filter(Boolean),
  };
  const errors: Record<string, string> = {};
  const r = Settings.safeParse(candidate);
  if (!r.success) {
    for (const issue of r.error.issues) {
      const key = String(issue.path[0] ?? 'form');
      if (errors[key]) continue;
      const v = (candidate as Record<string, unknown>)[key];
      errors[key] = typeof v === 'number' && Number.isNaN(v) ? 'Enter a number' : issue.message.replace(/^Too (small|big): expected number to be /, 'Must be ');
    }
  }
  if (!Number.isNaN(candidate.meal_allowance_per_meal) && candidate.meal_allowance_per_meal < 0) errors.meal_allowance_per_meal = 'Must be $0 or more';
  if (!Number.isNaN(candidate.season_travel_budget) && candidate.season_travel_budget <= 0) errors.season_travel_budget = 'Must be more than $0';
  if (!isValidClock(f.latest_hotel_arrival)) errors.latest_hotel_arrival = 'Use 24-hour HH:MM, e.g. 22:00';
  return { value: Object.keys(errors).length ? null : (r.data ?? null), errors };
}

export default function SettingsScreen() {
  const q = useSettings();
  const save = useSaveSettings();
  const reset = useResetDemo();
  const [form, setForm] = useState<Form | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  // (re)load the form from the server copy when it arrives or changes (after save / reset)
  useEffect(() => {
    if (q.data) setForm(toForm(q.data));
  }, [q.data]);

  const original = useMemo(() => (q.data ? JSON.stringify(toForm(q.data)) : ''), [q.data]);
  const dirty = !!form && JSON.stringify(form) !== original;
  const { value, errors } = useMemo(() => (form ? fromForm(form) : { value: null, errors: {} }), [form]);

  if (q.isLoading || (!form && !q.isError)) return <Loading label="Loading settings…" />;
  if (q.isError || !form) return <Screen><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;

  const setNum = (k: NumField, t: string) => { setSaved(null); setForm({ ...form, nums: { ...form.nums, [k]: t.replace(/[^0-9.]/g, '') } }); };
  const patch = (p: Partial<Form>) => { setSaved(null); setForm({ ...form, ...p }); };

  const onSave = () => {
    if (!value) return;
    save.mutate(value, { onSuccess: () => setSaved('Saved — all open trips recomputed.') });
  };

  const onReset = () =>
    Alert.alert('Reset all data?', 'This wipes every trip, request, rooming list, actual and setting change, and restores the starting season data.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => reset.mutate(undefined, { onSuccess: () => setSaved('Data reset to the start of the season.') }) },
    ]);

  const errorCount = Object.keys(errors).length;
  const footer = dirty ? (
    <View style={{ backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border, padding: space.md, gap: 6 }}>
      {save.isError && <Banner tone="danger" message={errorMessage(save.error)} />}
      {errorCount > 0 && <Caption tone="danger">Fix {errorCount} field{errorCount > 1 ? 's' : ''} before saving.</Caption>}
      <Row wrap={false}>
        <View style={{ flex: 1 }}><Button title="Discard" variant="ghost" onPress={() => q.data && setForm(toForm(q.data))} /></View>
        <View style={{ flex: 2 }}><Button title="Save & recompute" onPress={onSave} disabled={!value} loading={save.isPending} accessibilityHint="Saves settings and recomputes every open trip" /></View>
      </Row>
    </View>
  ) : null;

  return (
    <Screen keyboard footer={footer} onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <AiNotice message={ESTIMATE_NOTE} />
      {saved && <Banner tone="ok" message={saved} onDismiss={() => setSaved(null)} />}
      {reset.isError && <Banner tone="danger" message={errorMessage(reset.error)} />}
      <Caption>Change any value, then Save. Every open trip's packages are recomputed by code.</Caption>

      <Card>
        <Section title="Buses">
          <ToggleRow
            label="Use bus company default seats"
            hint="Turn off to set seats per bus yourself"
            value={form.useCompanySeats}
            onChange={(v) => patch({ useCompanySeats: v })}
          />
          {!form.useCompanySeats && (
            <Field label="Seats per bus" value={form.nums.seats_per_bus_override} onChangeText={(t) => setNum('seats_per_bus_override', t)} keyboardType="number-pad" error={errors.seats_per_bus_override} />
          )}
          <Text style={{ fontSize: font.sm, fontWeight: '700', color: colors.brown }}>Default bus company</Text>
          <Row>
            {BUS_COMPANIES.map((b) => <SelectChip key={b} label={b} selected={form.default_bus_company_id === b} onPress={() => patch({ default_bus_company_id: b })} />)}
          </Row>
        </Section>
      </Card>

      <Card>
        <Section title="Rooms" hint="People per room">
          <NumberStepper label="Player room occupancy (1–4)" value={form.player_room_occupancy} min={1} max={4} onChange={(v) => patch({ player_room_occupancy: v })} error={errors.player_room_occupancy} />
          <NumberStepper label="Coach room occupancy (1–4)" value={form.coach_room_occupancy} min={1} max={4} onChange={(v) => patch({ coach_room_occupancy: v })} error={errors.coach_room_occupancy} />
          <NumberStepper label="Support staff room occupancy (1–4)" value={form.support_room_occupancy} min={1} max={4} onChange={(v) => patch({ support_room_occupancy: v })} error={errors.support_room_occupancy} />
        </Section>
      </Card>

      <Card>
        <Section title="Meals">
          <Field label="Meal allowance per meal" prefix="$" value={form.nums.meal_allowance_per_meal} onChangeText={(t) => setNum('meal_allowance_per_meal', t)} keyboardType="decimal-pad" error={errors.meal_allowance_per_meal} />
        </Section>
      </Card>

      <Card>
        <Section title="Timing">
          <Field label="Average bus speed (20–80)" suffix="mph" value={form.nums.avg_bus_mph} onChangeText={(t) => setNum('avg_bus_mph', t)} keyboardType="decimal-pad" error={errors.avg_bus_mph} />
          <Field label="Departure buffer" suffix="min" value={form.nums.departure_buffer_min} onChangeText={(t) => setNum('departure_buffer_min', t)} keyboardType="number-pad" error={errors.departure_buffer_min} />
          <Field label="Min. hours arriving before kickoff" suffix="h" value={form.nums.min_hours_arrival_before_kickoff} onChangeText={(t) => setNum('min_hours_arrival_before_kickoff', t)} keyboardType="decimal-pad" error={errors.min_hours_arrival_before_kickoff} />
          <Field label="Min. hours between pre-game meal and kickoff" suffix="h" value={form.nums.min_hours_meal_before_kickoff} onChangeText={(t) => setNum('min_hours_meal_before_kickoff', t)} keyboardType="decimal-pad" error={errors.min_hours_meal_before_kickoff} />
          <Field label="Latest hotel arrival (24-hour)" value={form.latest_hotel_arrival} onChangeText={(t) => patch({ latest_hotel_arrival: t.replace(/[^0-9:]/g, '').slice(0, 5) })} keyboardType="numbers-and-punctuation" placeholder="22:00" error={errors.latest_hotel_arrival} />
        </Section>
      </Card>

      <Card>
        <Section title="Budget">
          <Field label="Contingency (0–50)" suffix="%" value={form.nums.contingency_pct} onChangeText={(t) => setNum('contingency_pct', t)} keyboardType="decimal-pad" error={errors.contingency_pct} />
          <Field label="Season travel budget" prefix="$" value={form.nums.season_travel_budget} onChangeText={(t) => setNum('season_travel_budget', t)} keyboardType="decimal-pad" error={errors.season_travel_budget} />
        </Section>
      </Card>

      <Card>
        <Section title="Athletes">
          <Field label="Roommate request deadline (days before game)" suffix="days" value={form.nums.roommate_request_deadline_days_before} onChangeText={(t) => setNum('roommate_request_deadline_days_before', t)} keyboardType="number-pad" error={errors.roommate_request_deadline_days_before} />
          <Text style={{ fontSize: font.sm, fontWeight: '700', color: colors.brown }}>Packing list</Text>
          {form.packing_list.map((item, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Field
                  label={`Item ${i + 1}`}
                  value={item}
                  onChangeText={(t) => patch({ packing_list: form.packing_list.map((p, j) => (j === i ? t : p)) })}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove packing item ${i + 1}${item ? `, ${item}` : ''}`}
                onPress={() => patch({ packing_list: form.packing_list.filter((_, j) => j !== i) })}
                style={({ pressed }) => ({ width: TAP, height: TAP, borderRadius: radius.md, backgroundColor: '#FCE4E2', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
              >
                <Text style={{ color: colors.danger, fontSize: 22, fontWeight: '800' }}>×</Text>
              </Pressable>
            </View>
          ))}
          <Button title="+ Add packing item" variant="ghost" onPress={() => patch({ packing_list: [...form.packing_list, ''] })} />
        </Section>
      </Card>

      <View style={{ marginTop: space.xl, gap: 6 }}>
        <Caption>Start over: wipe every change and restore the starting season data.</Caption>
        <Button title="Reset all data" variant="ghost" onPress={onReset} loading={reset.isPending} />
      </View>
    </Screen>
  );
}

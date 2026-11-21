/** Shared UI primitives (owned by Track B; Track C may add, don't change signatures without noting it). */
import type { ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, font, radius, space, TAP } from '../lib/theme';
import { errorMessage } from '../lib/api';

export function Screen({ children, scroll = true, style, refreshing, onRefresh, keyboard, footer }: {
  children: ReactNode; scroll?: boolean; style?: ViewStyle;
  /** optional pull-to-refresh (added B-02) */
  refreshing?: boolean; onRefresh?: () => void;
  /** wrap in KeyboardAvoidingView (added B-16) */
  keyboard?: boolean;
  /** sticky content below the scroll area, e.g. a Save bar (added B-07) */
  footer?: ReactNode;
}) {
  const inner = <View style={[{ padding: space.lg, gap: space.md }, style]}>{children}</View>;
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.orange} /> : undefined}
    >
      {inner}
    </ScrollView>
  ) : inner;
  return (
    <SafeAreaView edges={['left', 'right']} style={{ flex: 1, backgroundColor: colors.bg }}>
      {keyboard ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}>
          {body}
          {footer}
        </KeyboardAvoidingView>
      ) : (
        <>
          {body}
          {footer}
        </>
      )}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function H1({ children }: { children: ReactNode }) {
  return <Text style={s.h1}>{children}</Text>;
}
export function H2({ children }: { children: ReactNode }) {
  return <Text style={s.h2}>{children}</Text>;
}
export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[s.body, muted && { color: colors.muted }]}>{children}</Text>;
}

export function Button({ title, onPress, variant = 'primary', disabled, loading, accessibilityHint }: {
  title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'ghost'; disabled?: boolean; loading?: boolean; accessibilityHint?: string;
}) {
  const bg = variant === 'primary' ? colors.orange : variant === 'secondary' ? colors.brown : 'transparent';
  const fg = variant === 'ghost' ? colors.brown : '#fff';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled || !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [s.btn, { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 }, variant === 'ghost' && { borderWidth: 2, borderColor: colors.brown }]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[s.btnText, { color: fg }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{title}</Text>}
    </Pressable>
  );
}

export function Chip({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'brand' }) {
  const map = { neutral: [colors.brownSoft, colors.brown], ok: ['#E3F4EA', colors.ok], warn: ['#FFF1DE', colors.warn], danger: ['#FCE4E2', colors.danger], info: ['#E3EDF7', colors.info], brand: [colors.orangeSoft, colors.orange] } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[s.chip, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontWeight: '700', fontSize: font.sm }}>{label}</Text>
    </View>
  );
}

/** Every total in the app must carry this label (hackathon rule: costs are estimates). */
export function EstimateBadge() {
  return <Chip label="Estimate" tone="info" />;
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={s.center} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={colors.orange} />
      <Text style={s.muted}>{label}</Text>
    </View>
  );
}
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <Card style={{ borderColor: colors.danger }}>
      <Text style={[s.body, { color: colors.danger, fontWeight: '700' }]}>Something went wrong</Text>
      <Text style={s.body}>{errorMessage(error)}</Text>
      {onRetry && <Button title="Try again" variant="ghost" onPress={onRetry} />}
    </Card>
  );
}
export function Empty({ title, hint, action }: { title: string; hint?: string; /** optional button(s) (added B-02) */ action?: ReactNode }) {
  return (
    <View style={s.center}>
      <Text style={[s.h2, { textAlign: 'center' }]}>{title}</Text>
      {hint && <Text style={s.muted}>{hint}</Text>}
      {action ? <View style={{ alignSelf: 'stretch', marginTop: space.sm }}>{action}</View> : null}
    </View>
  );
}
/** Small banner used when an AI feature is paused/unavailable; the core planner still works. */
export function AiNotice({ message }: { message: string }) {
  return (
    <View style={s.notice} accessibilityRole="alert">
      <Text style={{ color: colors.brown, fontSize: font.sm }}>{message}</Text>
    </View>
  );
}

// ---------- additions (B-01..B-16): generic form + layout primitives ----------

/** Small muted helper line. */
export function Caption({ children, tone }: { children: ReactNode; tone?: 'muted' | 'warn' | 'danger' | 'ok' | 'info' }) {
  const color = tone === 'warn' ? colors.warn : tone === 'danger' ? colors.danger : tone === 'ok' ? colors.ok : tone === 'info' ? colors.info : colors.muted;
  return <Text style={{ fontSize: font.sm, color, lineHeight: 20 }}>{children}</Text>;
}

/** Horizontal row with gap + wrap. */
export function Row({ children, gap = space.sm, wrap = true, style }: { children: ReactNode; gap?: number; wrap?: boolean; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap, flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>{children}</View>;
}

/** Colored banner (success / error / warning / info) for inline feedback. */
export function Banner({ message, tone = 'info', onDismiss }: { message: string; tone?: 'ok' | 'warn' | 'danger' | 'info'; onDismiss?: () => void }) {
  const map = { ok: ['#E3F4EA', colors.ok], warn: ['#FFF1DE', colors.warn], danger: ['#FCE4E2', colors.danger], info: ['#E3EDF7', colors.info] } as const;
  const [bg, fg] = map[tone];
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: bg, borderLeftWidth: 4, borderLeftColor: fg, borderRadius: radius.md, padding: space.md, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <Text style={{ color: fg, fontSize: font.md, fontWeight: '600', flex: 1 }}>{message}</Text>
      {onDismiss && (
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={onDismiss} hitSlop={12} style={{ minWidth: 32, alignItems: 'center' }}>
          <Text style={{ color: fg, fontSize: font.lg, fontWeight: '800' }}>×</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Tappable chip (toggle or action). */
export function SelectChip({ label, selected, onPress, disabled, accessibilityHint }: { label: string; selected?: boolean; onPress: () => void; disabled?: boolean; accessibilityHint?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.selectChip,
        selected ? { backgroundColor: colors.orange, borderColor: colors.orange } : { backgroundColor: colors.card, borderColor: colors.border },
        { opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
      ]}
    >
      <Text style={{ color: selected ? '#fff' : colors.brown, fontWeight: '700', fontSize: font.md }}>{label}</Text>
    </Pressable>
  );
}

/** Segmented control. */
export function Segmented<T extends string>({ options, value, onChange, accessibilityLabel }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; accessibilityLabel?: string;
}) {
  return (
    <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} style={s.segWrap}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[s.segItem, on && { backgroundColor: colors.brown }]}
          >
            <Text style={{ color: on ? '#fff' : colors.brown, fontWeight: '700', fontSize: font.md, textAlign: 'center' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Labeled text input with error / highlight. */
export function Field({ label, value, onChangeText, error, highlight, keyboardType, placeholder, multiline, suffix, prefix, accessibilityLabel }: {
  label: string; value: string; onChangeText: (t: string) => void; error?: string | null; highlight?: boolean;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad' | 'numbers-and-punctuation'; placeholder?: string; multiline?: boolean;
  suffix?: string; prefix?: string; accessibilityLabel?: string;
}) {
  const border = error ? colors.danger : highlight ? colors.orange : colors.border;
  return (
    <View style={{ gap: 4 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <View style={[s.inputWrap, { borderColor: border, borderWidth: highlight || error ? 2 : 1 }, multiline && { alignItems: 'flex-start' }]}>
        {prefix ? <Text style={s.affix}>{prefix}</Text> : null}
        <TextInput
          accessibilityLabel={accessibilityLabel ?? label}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          multiline={multiline}
          style={[s.input, multiline && { minHeight: 96, textAlignVertical: 'top', paddingTop: 12 }]}
        />
        {suffix ? <Text style={s.affix}>{suffix}</Text> : null}
      </View>
      {highlight && !error ? <Text style={{ color: colors.orange, fontSize: font.sm, fontWeight: '700' }}>Please fill in</Text> : null}
      {error ? <Text style={{ color: colors.danger, fontSize: font.sm }}>{error}</Text> : null}
    </View>
  );
}

/** − / + number stepper with direct input and bounds. */
export function NumberStepper({ label, value, onChange, min, max, step = 1, highlight, error }: {
  label: string; value: number | null; onChange: (n: number | null) => void; min: number; max: number; step?: number; highlight?: boolean; error?: string | null;
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  const border = error ? colors.danger : highlight ? colors.orange : colors.border;
  return (
    <View style={{ gap: 4 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          disabled={value != null && value <= min}
          onPress={() => onChange(clamp((value ?? min) - step))}
          style={({ pressed }) => [s.stepBtn, { opacity: value != null && value <= min ? 0.4 : pressed ? 0.7 : 1 }]}
        >
          <Text style={s.stepBtnText}>−</Text>
        </Pressable>
        <TextInput
          accessibilityLabel={label}
          keyboardType="number-pad"
          value={value == null ? '' : String(value)}
          onChangeText={(t) => {
            const digits = t.replace(/[^0-9]/g, '');
            onChange(digits === '' ? null : Number(digits));
          }}
          onBlur={() => { if (value != null) onChange(clamp(value)); }}
          placeholder="—"
          placeholderTextColor={colors.muted}
          style={[s.stepInput, { borderColor: border, borderWidth: highlight || error ? 2 : 1 }]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          disabled={value != null && value >= max}
          onPress={() => onChange(clamp((value ?? min) + step))}
          style={({ pressed }) => [s.stepBtn, { opacity: value != null && value >= max ? 0.4 : pressed ? 0.7 : 1 }]}
        >
          <Text style={s.stepBtnText}>+</Text>
        </Pressable>
      </View>
      {highlight && !error ? <Text style={{ color: colors.orange, fontSize: font.sm, fontWeight: '700' }}>Please fill in</Text> : null}
      {error ? <Text style={{ color: colors.danger, fontSize: font.sm }}>{error}</Text> : null}
    </View>
  );
}

/** Label + switch row. */
export function ToggleRow({ label, hint, value, onChange, highlight }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; highlight?: boolean }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: TAP }, highlight && { borderWidth: 2, borderColor: colors.orange, borderRadius: radius.md, padding: space.sm }]}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: font.md, color: colors.text, fontWeight: '600' }}>{label}</Text>
        {hint ? <Text style={{ fontSize: font.sm, color: colors.muted }}>{hint}</Text> : null}
        {highlight ? <Text style={{ color: colors.orange, fontSize: font.sm, fontWeight: '700' }}>Please confirm</Text> : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.orange, false: colors.border }}
        thumbColor="#fff"
      />
    </View>
  );
}

const s = StyleSheet.create({
  selectChip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  segWrap: { flexDirection: 'row', backgroundColor: colors.brownSoft, borderRadius: radius.md, padding: 4, gap: 4 },
  segItem: { flex: 1, minHeight: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.sm },
  fieldLabel: { fontSize: font.sm, fontWeight: '700', color: colors.brown },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.md, paddingHorizontal: space.md },
  input: { flex: 1, minHeight: TAP, fontSize: font.lg, color: colors.text },
  affix: { fontSize: font.lg, color: colors.muted, fontWeight: '600' },
  stepBtn: { width: TAP, height: TAP, borderRadius: radius.md, backgroundColor: colors.brown, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { color: '#fff', fontSize: 26, fontWeight: '700', marginTop: -2 },
  stepInput: { minWidth: 72, height: TAP, borderRadius: radius.md, backgroundColor: colors.card, textAlign: 'center', fontSize: font.xl, fontWeight: '700', color: colors.text },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg, gap: space.sm, borderWidth: 1, borderColor: colors.border },
  h1: { fontSize: font.xxl, fontWeight: '800', color: colors.brown },
  h2: { fontSize: font.xl, fontWeight: '700', color: colors.brown },
  body: { fontSize: font.md, color: colors.text, lineHeight: 22 },
  muted: { fontSize: font.md, color: colors.muted, textAlign: 'center' },
  btn: { minHeight: TAP + 4, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.md },
  btnText: { fontSize: font.lg, fontWeight: '700' },
  chip: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  center: { alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.sm },
  notice: { backgroundColor: colors.orangeSoft, borderRadius: radius.md, padding: space.md, borderLeftWidth: 4, borderLeftColor: colors.orange },
});

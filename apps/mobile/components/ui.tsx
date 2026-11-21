/** Shared UI primitives (owned by Track B; Track C may add, don't change signatures without noting it). */
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, font, radius, space, TAP } from '../lib/theme';
import { errorMessage } from '../lib/api';

export function Screen({ children, scroll = true, style }: { children: ReactNode; scroll?: boolean; style?: ViewStyle }) {
  const inner = <View style={[{ padding: space.lg, gap: space.md }, style]}>{children}</View>;
  return (
    <SafeAreaView edges={['left', 'right']} style={{ flex: 1, backgroundColor: colors.bg }}>
      {scroll ? <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>{inner}</ScrollView> : inner}
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
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[s.btnText, { color: fg }]}>{title}</Text>}
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
export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={s.center}>
      <Text style={s.h2}>{title}</Text>
      {hint && <Text style={s.muted}>{hint}</Text>}
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

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg, gap: space.sm, borderWidth: 1, borderColor: colors.border },
  h1: { fontSize: font.xxl, fontWeight: '800', color: colors.brown },
  h2: { fontSize: font.xl, fontWeight: '700', color: colors.brown },
  body: { fontSize: font.md, color: colors.text, lineHeight: 22 },
  muted: { fontSize: font.md, color: colors.muted, textAlign: 'center' },
  btn: { minHeight: TAP + 4, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg },
  btnText: { fontSize: font.lg, fontWeight: '700' },
  chip: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  center: { alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.sm },
  notice: { backgroundColor: colors.orangeSoft, borderRadius: radius.md, padding: space.md, borderLeftWidth: 4, borderLeftColor: colors.orange },
});

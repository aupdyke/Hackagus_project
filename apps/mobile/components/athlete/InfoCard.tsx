import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, space } from '../../lib/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Small fact tile (Bus / Room / Hotel). */
export function InfoCard({ icon, title, value, detail, onPress, accessibilityHint }: {
  icon: IconName; title: string; value: string; detail?: ReactNode; onPress?: () => void; accessibilityHint?: string;
}) {
  const body = (
    <View style={s.card}>
      <View style={s.head}>
        <Ionicons name={icon} size={18} color={colors.orange} />
        <Text style={s.title}>{title}</Text>
      </View>
      <Text style={s.value} numberOfLines={2}>{value}</Text>
      {typeof detail === 'string' ? <Text style={s.detail}>{detail}</Text> : detail}
    </View>
  );
  if (!onPress) return <View style={{ flex: 1 }} accessible accessibilityLabel={`${title}: ${value}`}>{body}</View>;
  return (
    <Pressable style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={`${title}: ${value}`} accessibilityHint={accessibilityHint} onPress={onPress}>
      {body}
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { flex: 1, backgroundColor: colors.card, borderRadius: radius.lg, padding: space.md, borderWidth: 1, borderColor: colors.border, gap: 4, minHeight: 96 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: font.sm, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: font.xl, fontWeight: '800', color: colors.brown },
  detail: { fontSize: font.sm, color: colors.text },
});

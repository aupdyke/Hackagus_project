import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ChangeItem } from '@falcon/shared';
import { colors, font, space } from '../../lib/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];
const ICON: Record<ChangeItem['kind'], IconName> = {
  time: 'time', hotel: 'business', bus: 'bus', roommate: 'people', meal: 'restaurant', added: 'add-circle', removed: 'remove-circle',
};

/** One change: label, before (struck through) → after (bold). Itinerary items link to My Trip. */
export function ChangeRow({ change }: { change: ChangeItem }) {
  const single = change.kind === 'added' || change.kind === 'removed';
  const label = single
    ? `${change.label}: ${change.kind === 'added' ? 'added' : 'removed'} ${change.after || change.before}`
    : `${change.label}: was ${change.before}, now ${change.after}`;
  const linkable = change.item_id.startsWith('IT-');
  const body = (
    <View style={s.row}>
      <Ionicons name={ICON[change.kind]} size={20} color={colors.orange} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.label}>{change.label}</Text>
        {single ? (
          <Text style={[s.after, change.kind === 'removed' && { color: colors.danger }]}>
            {change.kind === 'added' ? 'Added: ' : 'Removed: '}
            {change.after || change.before}
          </Text>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            <Text style={s.before}>{change.before}</Text>
            <Text style={{ color: colors.muted }}>→</Text>
            <Text style={s.after}>{change.after}</Text>
          </View>
        )}
      </View>
      {linkable && <Ionicons name="chevron-forward" size={18} color={colors.muted} />}
    </View>
  );
  if (!linkable) return <View accessible accessibilityLabel={label}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Shows this item in your itinerary"
      onPress={() => router.push({ pathname: '/(athlete)/my-trip', params: { focus: change.item_id } })}
    >
      {body}
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm, paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: colors.border, minHeight: 44 },
  label: { fontSize: font.sm, fontWeight: '700', color: colors.muted },
  before: { fontSize: font.md, color: colors.muted, textDecorationLine: 'line-through' },
  after: { fontSize: font.md, color: colors.text, fontWeight: '800' },
});

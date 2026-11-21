/** Horizontal labeled bar (B-15). */
import { Text, View } from 'react-native';
import { colors, font } from '../../lib/theme';

export function Bar({ label, ratio, right, color }: { label: string; ratio: number; right: string; color?: string }) {
  const r = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  const tone = color ?? (r >= 0.9 ? colors.ok : r >= 0.7 ? colors.warn : colors.danger);
  return (
    <View accessible accessibilityLabel={`${label}: ${right}, ${Math.round(r * 100)} percent`} style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <Text style={{ fontSize: font.md, color: colors.text, fontWeight: '600', flexShrink: 1 }}>{label}</Text>
        <Text style={{ fontSize: font.md, color: colors.text, fontVariant: ['tabular-nums'] }}>{right}</Text>
      </View>
      <View style={{ height: 14, borderRadius: 7, backgroundColor: colors.brownSoft, overflow: 'hidden' }}>
        <View style={{ width: `${r * 100}%` as const, height: '100%', backgroundColor: tone }} />
      </View>
    </View>
  );
}

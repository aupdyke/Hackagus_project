/** Cost breakdown table (all numbers from code). */
import { StyleSheet, Text, View } from 'react-native';
import { formatUSD, type CostBreakdown } from '@falcon/shared';
import { EstimateBadge } from '../ui';
import { colors, font, space } from '../../lib/theme';

const ROWS: { key: keyof CostBreakdown; label: string }[] = [
  { key: 'bus', label: 'Bus' },
  { key: 'equipment', label: 'Equipment truck' },
  { key: 'hotel', label: 'Hotel' },
  { key: 'meals', label: 'Meals' },
  { key: 'contingency', label: 'Contingency' },
];

export function CostTable({ costs }: { costs: CostBreakdown }) {
  return (
    <View style={s.wrap}>
      {ROWS.map((r) => (
        <View key={r.key} style={s.row} accessible accessibilityLabel={`${r.label} ${formatUSD(costs[r.key])}`}>
          <Text style={s.label}>{r.label}</Text>
          <Text style={s.value}>{formatUSD(costs[r.key])}</Text>
        </View>
      ))}
      <View style={[s.row, s.total]} accessible accessibilityLabel={`Total estimate ${formatUSD(costs.total)}`}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Text style={[s.label, s.totalText]}>Total</Text>
          <EstimateBadge />
        </View>
        <Text style={[s.value, s.totalText]}>{formatUSD(costs.total)}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  label: { fontSize: font.md, color: colors.muted },
  value: { fontSize: font.md, color: colors.text, fontVariant: ['tabular-nums'] },
  total: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 4, paddingTop: 8 },
  totalText: { fontSize: font.lg, fontWeight: '800', color: colors.brown },
});

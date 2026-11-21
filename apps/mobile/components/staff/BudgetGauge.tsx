/** Season budget bar (B-13): committed (brown) + drafts (orange), budget marker, red overflow. View widths only. */
import { Text, View } from 'react-native';
import { formatUSD } from '@falcon/shared';
import { colors, font } from '../../lib/theme';

export function BudgetGauge({ budget, committed, projected }: { budget: number; committed: number; projected: number }) {
  const scale = Math.max(budget, projected, 1);
  const pct = (n: number) => `${Math.max(0, Math.min(100, (n / scale) * 100))}%` as const;
  const draft = Math.max(0, projected - committed);
  const over = projected > budget;
  const usedPct = budget > 0 ? Math.round((projected / budget) * 100) : 0;
  return (
    <View
      accessible
      accessibilityLabel={`Season budget gauge: committed ${formatUSD(committed)}, drafts ${formatUSD(draft)}, projected ${formatUSD(projected)} of ${formatUSD(budget)} budget, ${usedPct} percent${over ? ', over budget' : ''}. Estimates.`}
      style={{ gap: 6 }}
    >
      <View style={{ height: 36, borderRadius: 10, backgroundColor: colors.brownSoft, overflow: 'hidden', flexDirection: 'row' }}>
        <View style={{ width: pct(committed), backgroundColor: colors.brown }} />
        <View style={{ width: pct(draft), backgroundColor: colors.orange }} />
        {over && (
          <View
            style={{ position: 'absolute', left: pct(budget), top: 0, bottom: 0, right: 0, backgroundColor: colors.danger, opacity: 0.85 }}
          />
        )}
        {/* budget marker */}
        <View style={{ position: 'absolute', left: pct(budget), top: 0, bottom: 0, width: 4, marginLeft: -2, backgroundColor: '#000' }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: font.sm, color: colors.muted }}>$0</Text>
        <Text style={{ fontSize: font.sm, color: over ? colors.danger : colors.text, fontWeight: '800' }}>
          {usedPct}% of budget {over ? '(over)' : 'used'}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
        <Legend color={colors.brown} label="Committed" />
        <Legend color={colors.orange} label="Drafts" />
        {over && <Legend color={colors.danger} label="Over budget" />}
        <Legend color="#000" label="Budget line" thin />
      </View>
    </View>
  );
}

function Legend({ color, label, thin }: { color: string; label: string; thin?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: thin ? 4 : 14, height: 14, borderRadius: thin ? 0 : 3, backgroundColor: color }} />
      <Text style={{ fontSize: font.sm, color: colors.text }}>{label}</Text>
    </View>
  );
}

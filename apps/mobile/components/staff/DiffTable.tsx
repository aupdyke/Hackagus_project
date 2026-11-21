/** Before → after totals per package (B-08). Numbers come only from the server's code-computed diff. */
import { Text, View } from 'react-native';
import { formatUSD, type PackageDiff, type TravelPackage } from '@falcon/shared';
import { EstimateBadge, Row } from '../ui';
import { colors, font } from '../../lib/theme';
import { MoneyDelta } from './Money';

export function DiffTable({ diff, packages }: { diff: PackageDiff[]; packages: TravelPackage[] }) {
  const label = (id: string) => packages.find((p) => p.option_id === id)?.label ?? id;
  const usd = (n: number | null) => (n == null ? '—' : formatUSD(n));
  if (!diff.length) return null;
  return (
    <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }}>
      <Row>
        <Text style={{ fontWeight: '800', color: colors.brown, fontSize: font.md }}>What changed</Text>
        <EstimateBadge />
      </Row>
      {diff.map((d) => (
        <View
          key={d.option_id}
          accessible
          accessibilityLabel={`${label(d.option_id)}: ${usd(d.before_total)} before, ${usd(d.after_total)} after, ${d.delta < 0 ? 'saves' : d.delta > 0 ? 'adds' : 'changes'} ${formatUSD(Math.abs(d.delta))}. ${d.changes.join('. ')}`}
          style={{ gap: 2 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontWeight: '700', color: colors.text }}>{label(d.option_id)}</Text>
              <Text style={{ color: colors.muted, fontSize: font.sm, fontVariant: ['tabular-nums'] }}>
                {usd(d.before_total)} → {usd(d.after_total)}
              </Text>
            </View>
            <MoneyDelta value={d.delta} size="sm" estimate={false} />
          </View>
          {d.changes.map((c, i) => <Text key={i} style={{ color: colors.text, fontSize: font.sm, flexShrink: 1 }}>• {c}</Text>)}
        </View>
      ))}
    </View>
  );
}

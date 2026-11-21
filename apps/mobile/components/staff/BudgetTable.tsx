/** Planned vs actual by category (B-12). Every number comes from the server's BudgetVsActual. */
import { Text, View } from 'react-native';
import { formatUSD, type BudgetVsActual } from '@falcon/shared';
import { Caption, EstimateBadge, Row } from '../ui';
import { colors, font } from '../../lib/theme';

const LABEL: Record<BudgetVsActual['lines'][number]['category'], string> = {
  bus: 'Bus', equipment: 'Equipment', hotel: 'Hotel', meals: 'Meals', other: 'Other', contingency: 'Contingency',
};

export const varianceColor = (v: number | null) => (v == null || v === 0 ? colors.muted : v > 0 ? colors.danger : colors.ok);
export const varianceText = (v: number | null) => (v == null ? '—' : `${v > 0 ? '+' : ''}${formatUSD(v)}`);
const usd = (v: number | null) => (v == null ? '—' : formatUSD(v));

function Cells({ a, b, c, d, bold, vColor }: { a: string; b: string; c: string; d: string; bold?: boolean; vColor?: string }) {
  const st = { fontSize: font.md, color: colors.text, fontWeight: bold ? ('800' as const) : ('400' as const), fontVariant: ['tabular-nums' as const] };
  return (
    <View style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Text style={[st, { flex: 1.1 }]}>{a}</Text>
      <Text style={[st, { flex: 1, textAlign: 'right' }]}>{b}</Text>
      <Text style={[st, { flex: 1, textAlign: 'right' }]}>{c}</Text>
      <Text style={[st, { flex: 1, textAlign: 'right', color: vColor ?? st.color }]}>{d}</Text>
    </View>
  );
}

export function BudgetTable({ bva }: { bva: BudgetVsActual }) {
  return (
    <View>
      <Row style={{ marginBottom: 4 }}>
        <EstimateBadge />
        <Caption>Planned = estimate · variance = actual − planned</Caption>
      </Row>
      <View style={{ flexDirection: 'row', paddingBottom: 4 }}>
        {['Category', 'Planned', 'Actual', 'Variance'].map((h, i) => (
          <Text key={h} style={{ flex: i === 0 ? 1.1 : 1, textAlign: i === 0 ? 'left' : 'right', fontSize: font.sm, fontWeight: '800', color: colors.brown }}>{h}</Text>
        ))}
      </View>
      {bva.lines.map((l) => (
        <View
          key={l.category}
          accessible
          accessibilityLabel={`${LABEL[l.category]}: planned estimate ${usd(l.planned)}, actual ${usd(l.actual)}, ${l.variance == null ? 'no variance' : l.variance > 0 ? `over by ${formatUSD(l.variance)}` : `under by ${formatUSD(-l.variance)}`}`}
        >
          <Cells a={LABEL[l.category]} b={usd(l.planned)} c={usd(l.actual)} d={varianceText(l.variance)} vColor={varianceColor(l.variance)} />
        </View>
      ))}
      <View
        accessible
        accessibilityLabel={`Total: planned estimate ${usd(bva.planned_total)}, actual ${usd(bva.actual_total)}, variance ${varianceText(bva.variance_total)}`}
      >
        <Cells a="Total" b={usd(bva.planned_total)} c={usd(bva.actual_total)} d={varianceText(bva.variance_total)} bold vColor={varianceColor(bva.variance_total)} />
      </View>
      {bva.variance_total != null && bva.variance_total !== 0 && (
        <Text style={{ marginTop: 6, fontWeight: '700', color: varianceColor(bva.variance_total) }}>
          {bva.variance_total > 0 ? `Over plan by ${formatUSD(bva.variance_total)}` : `Under plan by ${formatUSD(-bva.variance_total)}`}
        </Text>
      )}
    </View>
  );
}

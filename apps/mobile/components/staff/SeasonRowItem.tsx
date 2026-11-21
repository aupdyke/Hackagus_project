/** One season row (B-13): tap → trip planner. */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { formatDate, formatUSD, type SeasonRow } from '@falcon/shared';
import { Card, Chip, Row } from '../ui';
import { colors, font } from '../../lib/theme';
import { Money } from './Money';
import { StatusChip, statusLabel } from './StatusChip';
import { varianceColor, varianceText } from './BudgetTable';

const COUNTS: Record<SeasonRow['counts_toward'], string> = { committed: 'Committed', projected: 'Draft (projected)', none: 'Not counted' };

export function SeasonRowItem({ row }: { row: SeasonRow }) {
  const label = [
    `${formatDate(row.date)}, at ${row.opponent}`,
    statusLabel(row.status),
    row.selected_label || 'no package selected',
    row.planned_cost != null ? `planned estimate ${formatUSD(row.planned_cost)}` : 'not planned',
    row.actual_cost != null ? `actual ${formatUSD(row.actual_cost)}` : '',
    row.variance != null ? `variance ${varianceText(row.variance)}` : '',
    row.risk_count ? `${row.risk_count} risks` : '',
  ].filter(Boolean).join(', ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens the trip"
      onPress={() => router.push({ pathname: '/(staff)/trips/[id]', params: { id: row.trip_id } })}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: font.sm, color: colors.muted, fontWeight: '700' }}>{formatDate(row.date)}</Text>
            <Text style={{ fontSize: font.xl, color: colors.brown, fontWeight: '800' }}>at {row.opponent}</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={colors.muted} />
        </View>
        <Row>
          <StatusChip status={row.status} />
          {row.selected_label ? <Chip label={row.selected_label} /> : null}
          {row.risk_count > 0 && <Chip label={`${row.risk_count} risk${row.risk_count > 1 ? 's' : ''}`} tone="warn" />}
          <Chip label={COUNTS[row.counts_toward]} tone={row.counts_toward === 'committed' ? 'neutral' : row.counts_toward === 'projected' ? 'brand' : 'neutral'} />
        </Row>
        <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
          <View>
            <Text style={{ fontSize: font.sm, color: colors.muted }}>Planned</Text>
            {row.planned_cost != null ? <Money value={row.planned_cost} size="sm" /> : <Text style={{ color: colors.muted }}>Not planned</Text>}
          </View>
          {row.actual_cost != null && (
            <View>
              <Text style={{ fontSize: font.sm, color: colors.muted }}>Actual</Text>
              <Money value={row.actual_cost} size="sm" estimate={false} />
            </View>
          )}
          {row.variance != null && (
            <View>
              <Text style={{ fontSize: font.sm, color: colors.muted }}>Variance</Text>
              <Text style={{ fontSize: font.md, fontWeight: '800', color: varianceColor(row.variance) }}>{varianceText(row.variance)}</Text>
            </View>
          )}
        </View>
      </Card>
    </Pressable>
  );
}

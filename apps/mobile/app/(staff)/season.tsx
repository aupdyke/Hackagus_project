/** Season budget (B-13). Demo step 1: "Season over budget" — must read clearly on a projector. */
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { ESTIMATE_NOTE, formatUSD } from '@falcon/shared';
import { Button, Caption, Card, Empty, ErrorState, Loading, Screen } from '../../components/ui';
import { BudgetGauge } from '../../components/staff/BudgetGauge';
import { Money } from '../../components/staff/Money';
import { SeasonRowItem } from '../../components/staff/SeasonRowItem';
import { Section } from '../../components/staff/Section';
import { varianceColor, varianceText } from '../../components/staff/BudgetTable';
import { useSeason } from '../../lib/staff/queries';
import { colors, font, radius, space } from '../../lib/theme';

function Kpi({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <View style={{ flexBasis: '47%', flexGrow: 1, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: 2 }}>
      <Text style={{ fontSize: font.sm, color: colors.muted, fontWeight: '700' }}>{label}</Text>
      <Money value={value} size="md" label={label} color={tone} />
    </View>
  );
}

export default function Season() {
  const q = useSeason();
  if (q.isLoading) return <Loading label="Loading season budget…" />;
  if (q.isError) return <Screen><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;
  const s = q.data!;
  const overBy = -s.remaining;
  const rows = [...s.rows].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      {s.over_budget ? (
        <View accessibilityRole="alert" style={{ backgroundColor: colors.danger, borderRadius: radius.lg, padding: space.lg, gap: 4 }}>
          <Text style={{ color: '#fff', fontSize: font.xxl, fontWeight: '900' }}>Over budget by {formatUSD(overBy)}</Text>
          <Text style={{ color: '#fff', fontSize: font.md }}>Projected season travel exceeds the {formatUSD(s.budget)} budget. (Estimate)</Text>
        </View>
      ) : (
        <View style={{ backgroundColor: '#E3F4EA', borderRadius: radius.lg, padding: space.lg, borderLeftWidth: 6, borderLeftColor: colors.ok }}>
          <Text style={{ color: colors.ok, fontSize: font.xl, fontWeight: '800' }}>Under budget · {formatUSD(s.remaining)} remaining</Text>
          <Text style={{ color: colors.text, fontSize: font.sm }}>Estimate</Text>
        </View>
      )}

      <Card>
        <Section title="Season travel budget">
          <BudgetGauge budget={s.budget} committed={s.committed} projected={s.projected} />
        </Section>
      </Card>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
        <Kpi label="Budget" value={s.budget} />
        <Kpi label="Committed" value={s.committed} />
        <Kpi label="Projected" value={s.projected} tone={s.over_budget ? colors.danger : undefined} />
        <Kpi label="Remaining" value={s.remaining} tone={s.remaining < 0 ? colors.danger : colors.ok} />
      </View>
      <Caption>Committed = approved, published and completed trips (actuals when entered). Projected = committed + drafts.</Caption>

      {s.over_budget && (
        <Button
          title="Get back under budget"
          onPress={() => router.push('/savings')}
          accessibilityHint="Finds savings across upcoming trips"
        />
      )}

      <Section title={`Trips (${rows.length})`} hint="Tap a trip to open its planner.">
        {rows.length ? rows.map((r) => <SeasonRowItem key={r.trip_id} row={r} />) : <Empty title="No away trips" />}
      </Section>

      <Card>
        <Section title="Actuals so far">
          <Caption>{s.actuals.trips_completed} completed trip{s.actuals.trips_completed === 1 ? '' : 's'} with actuals entered</Caption>
          <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
            <View><Caption>Planned</Caption><Money value={s.actuals.planned_total} size="sm" /></View>
            <View><Caption>Actual</Caption><Money value={s.actuals.actual_total} size="sm" estimate={false} /></View>
            <View>
              <Caption>Variance</Caption>
              <Text style={{ fontSize: font.lg, fontWeight: '800', color: varianceColor(s.actuals.variance) }}>{varianceText(s.actuals.variance)}</Text>
            </View>
          </View>
        </Section>
      </Card>

      <Caption>{ESTIMATE_NOTE}</Caption>
      <Button title="Switch role" variant="ghost" onPress={() => router.replace('/')} />
    </Screen>
  );
}

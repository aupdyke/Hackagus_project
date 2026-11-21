/** Away trips list (B-02): upcoming first, completed dimmed, pull-to-refresh. */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { formatClock, formatDate, formatUSD, type TripSummary } from '@falcon/shared';
import { Body, Caption, Card, Chip, Empty, ErrorState, H2, Loading, Row, Screen } from '../../../components/ui';
import { Money } from '../../../components/staff/Money';
import { Section } from '../../../components/staff/Section';
import { StatusChip, statusLabel } from '../../../components/staff/StatusChip';
import { useTrips } from '../../../lib/staff/queries';
import { colors, space } from '../../../lib/theme';

function TripCard({ t }: { t: TripSummary }) {
  const done = t.status === 'completed';
  const label = [
    `Trip at ${t.opponent}`,
    formatDate(t.date),
    statusLabel(t.status),
    t.estimated_total != null ? `total estimate ${formatUSD(t.estimated_total)}` : 'not planned yet',
    t.risk_count ? `${t.risk_count} risk flag${t.risk_count > 1 ? 's' : ''}` : '',
  ].filter(Boolean).join(', ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens the trip planner"
      onPress={() => router.push({ pathname: '/(staff)/trips/[id]', params: { id: t.trip_id } })}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : done ? 0.7 : 1 })}
    >
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.sm }}>
          <View style={{ flex: 1, gap: 2 }}>
            <H2>at {t.opponent}</H2>
            <Body muted>{formatDate(t.date)} · {formatClock(t.kickoff_local)} kickoff</Body>
            <Body muted>{t.city}, {t.state}</Body>
          </View>
          <Ionicons name="chevron-forward" size={22} color={colors.muted} />
        </View>
        <Row>
          <StatusChip status={t.status} />
          {t.selected_label ? <Chip label={t.selected_label} /> : null}
          {t.risk_count > 0 ? <Chip label={`${t.risk_count} risk${t.risk_count > 1 ? 's' : ''}`} tone="warn" /> : null}
        </Row>
        {t.estimated_total != null ? (
          <View style={{ gap: 2 }}>
            <Money value={t.estimated_total} label="Total" />
            {!t.selected_option_id ? <Caption>Cheapest feasible option shown — no package selected yet</Caption> : null}
          </View>
        ) : (
          <Caption>Not planned yet — tap to start the request</Caption>
        )}
      </Card>
    </Pressable>
  );
}

export default function Trips() {
  const q = useTrips();
  if (q.isLoading) return <Loading label="Loading away trips…" />;
  if (q.isError) return <Screen><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;
  const trips = q.data ?? [];
  if (!trips.length) return <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}><Empty title="No away trips" hint="Pull down to refresh." /></Screen>;
  const byDate = (a: TripSummary, b: TripSummary) => a.date.localeCompare(b.date);
  const upcoming = trips.filter((t) => t.status !== 'completed').sort(byDate);
  const completed = trips.filter((t) => t.status === 'completed').sort(byDate);
  return (
    <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <Caption>Tap a trip to plan it step by step. All costs are estimates.</Caption>
      <Section title={`Upcoming (${upcoming.length})`}>
        {upcoming.length ? upcoming.map((t) => <TripCard key={t.trip_id} t={t} />) : <Caption>No upcoming away trips.</Caption>}
      </Section>
      {completed.length > 0 && (
        <Section title={`Completed (${completed.length})`}>
          {completed.map((t) => <TripCard key={t.trip_id} t={t} />)}
        </Section>
      )}
    </Screen>
  );
}

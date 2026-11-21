/** Season budget view — shell. Track B task B-13 builds the gauge, rows and savings flow. */
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { formatUSD } from '@falcon/shared';
import { Body, Button, Card, Chip, ErrorState, EstimateBadge, H2, Loading, Screen } from '../../components/ui';
import { api } from '../../lib/api';

export default function Season() {
  const q = useQuery({ queryKey: ['season'], queryFn: () => api.getSeason() });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <Screen><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;
  const s = q.data!;
  return (
    <Screen>
      <Card>
        <H2>Season travel budget</H2>
        <EstimateBadge />
        <Body>Budget {formatUSD(s.budget)} · Committed {formatUSD(s.committed)} · Projected {formatUSD(s.projected)}</Body>
        <Body>Remaining {formatUSD(s.remaining)}</Body>
        {s.over_budget && <Chip label="Over budget" tone="danger" />}
      </Card>
      {s.rows.map((r) => (
        <Card key={r.trip_id}>
          <Body>{r.date} · at {r.opponent}</Body>
          <Chip label={r.status} />
          <Body muted>{r.planned_cost != null ? `${formatUSD(r.planned_cost)} (estimate)` : 'Not planned yet'}</Body>
        </Card>
      ))}
      <Button title="Switch role" variant="ghost" onPress={() => router.replace('/')} />
    </Screen>
  );
}

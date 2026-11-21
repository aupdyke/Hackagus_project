/** Away trips list — shell. Track B task B-02 polishes it. */
import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { Pressable } from 'react-native';
import { formatDate, formatUSD } from '@falcon/shared';
import { Body, Card, Chip, Empty, ErrorState, H2, Loading, Screen } from '../../../components/ui';
import { api } from '../../../lib/api';

export default function Trips() {
  const q = useQuery({ queryKey: ['trips'], queryFn: () => api.listTrips() });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <Screen><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;
  if (!q.data?.length) return <Empty title="No away trips" />;
  return (
    <Screen>
      {q.data.map((t) => (
        <Link key={t.trip_id} href={{ pathname: '/(staff)/trips/[id]', params: { id: t.trip_id } }} asChild>
          <Pressable accessibilityRole="button" accessibilityLabel={`Trip at ${t.opponent}, ${t.status}`}>
            <Card>
              <H2>at {t.opponent}</H2>
              <Body muted>{formatDate(t.date)} · {t.city}, {t.state}</Body>
              <Chip label={t.status} />
              {t.estimated_total != null && <Body>{formatUSD(t.estimated_total)} · Estimate</Body>}
            </Card>
          </Pressable>
        </Link>
      ))}
    </Screen>
  );
}

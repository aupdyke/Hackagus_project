/** Trip workflow — shell. Track B tasks B-02..B-12 replace this with the 7-step stepper. */
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { formatUSD } from '@falcon/shared';
import { Body, Card, Chip, ErrorState, EstimateBadge, H2, Loading, Screen } from '../../../components/ui';
import { api } from '../../../lib/api';

export default function TripDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ['trip', id], queryFn: () => api.getTrip({ params: { id: id! } }), enabled: !!id });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <Screen><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;
  const { trip, game } = q.data!;
  return (
    <Screen>
      <Stack.Screen options={{ title: `at ${game.opponent}` }} />
      <Chip label={trip.status} />
      <Body muted>Steps: Request → Packages → What-if → Memo → Rooming → Publish → Actuals</Body>
      {trip.packages.map((p) => (
        <Card key={p.option_id}>
          <H2>{p.label}</H2>
          <Body muted>{p.option_id} · {p.hotel_name}</Body>
          <Body>{formatUSD(p.costs.total)}</Body>
          <EstimateBadge />
        </Card>
      ))}
      {!trip.packages.length && <Body>No request yet.</Body>}
    </Screen>
  );
}

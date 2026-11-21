/** My Trip — shell. Track C task C-05 builds countdown, timeline, bus/room cards, packing list, share. */
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { formatDayTime } from '@falcon/shared';
import { Body, Button, Card, Empty, ErrorState, H2, Loading, Screen } from '../../components/ui';
import { api } from '../../lib/api';
import { useSession } from '../../lib/role';

export default function MyTrip() {
  const { session } = useSession();
  const id = session.athleteId;
  const q = useQuery({ queryKey: ['my-trip', id], queryFn: () => api.myTrip({ params: { id: id! } }), enabled: !!id });
  if (!id) return <Screen><Button title="Pick an athlete" onPress={() => router.replace('/')} /></Screen>;
  if (q.isLoading) return <Loading />;
  if (q.isError) return <Screen><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;
  const { athlete, trip } = q.data!;
  return (
    <Screen>
      <H2>Hi {athlete.name}</H2>
      {!trip ? (
        <Empty title="No published trip yet" hint="You'll see your itinerary here once staff publish it." />
      ) : (
        <Card>
          <H2>at {trip.game.opponent}</H2>
          <Body>Departs {formatDayTime(trip.departure_local)}</Body>
          <Body>Bus {trip.bus_number ?? '—'} · Hotel {trip.hotel.name}</Body>
        </Card>
      )}
      <Button title="Switch role" variant="ghost" onPress={() => router.replace('/')} />
    </Screen>
  );
}

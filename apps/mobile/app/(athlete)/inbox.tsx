/** Inbox — shell. Track C task C-07 builds the before → after list + mark read. */
import { useQuery } from '@tanstack/react-query';
import { Body, Card, Empty, ErrorState, H2, Loading, Screen } from '../../components/ui';
import { api } from '../../lib/api';
import { useSession } from '../../lib/role';

export default function Inbox() {
  const id = useSession().session.athleteId;
  const q = useQuery({ queryKey: ['notifications', id], queryFn: () => api.notifications({ params: { id: id! } }), enabled: !!id });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <Screen><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;
  if (!q.data?.length) return <Empty title="No updates" />;
  return (
    <Screen>
      {q.data.map((n) => (
        <Card key={n.id}>
          <H2>{n.title}</H2>
          <Body>{n.body}</Body>
        </Card>
      ))}
    </Screen>
  );
}

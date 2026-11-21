/** Settings — shell (read-only). Track B task B-07 makes every field editable. */
import { useQuery } from '@tanstack/react-query';
import { ESTIMATE_NOTE } from '@falcon/shared';
import { AiNotice, Body, Card, ErrorState, Loading, Screen } from '../../components/ui';
import { api } from '../../lib/api';

export default function Settings() {
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api.getSettings() });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <Screen><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;
  const s = q.data!;
  return (
    <Screen>
      <AiNotice message={ESTIMATE_NOTE} />
      <Card>
        {Object.entries(s).filter(([k]) => k !== 'packing_list').map(([k, v]) => (
          <Body key={k}>{k}: {String(v)}</Body>
        ))}
      </Card>
    </Screen>
  );
}

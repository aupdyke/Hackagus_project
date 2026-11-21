/** AI Usage + Accuracy — shell. Track B task B-15 builds the full screen. */
import { useQuery } from '@tanstack/react-query';
import { Body, Card, ErrorState, H2, Loading, Screen } from '../../components/ui';
import { api } from '../../lib/api';

export default function Ai() {
  const usage = useQuery({ queryKey: ['ai-usage'], queryFn: () => api.aiUsage() });
  if (usage.isLoading) return <Loading />;
  if (usage.isError) return <Screen><ErrorState error={usage.error} onRetry={() => usage.refetch()} /></Screen>;
  const u = usage.data!;
  return (
    <Screen>
      <Card>
        <H2>AI usage {u.mock_mode ? '(mock mode)' : ''}</H2>
        <Body>Calls {u.totals.calls} · errors {u.totals.errors}</Body>
        <Body>Tokens in {u.totals.input_tokens} / out {u.totals.output_tokens} · credits {u.totals.credits}</Body>
      </Card>
    </Screen>
  );
}

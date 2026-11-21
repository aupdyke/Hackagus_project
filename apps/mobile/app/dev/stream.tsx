/** Phase-0 risk check: streaming SSE from our server to the phone via expo/fetch. */
import { useRef, useState } from 'react';
import { Text } from 'react-native';
import { streamUrl } from '@falcon/shared';
import { Body, Button, Card, ErrorState, Screen } from '../../components/ui';
import { API_URL } from '../../lib/config';
import { streamSse } from '../../lib/sse';
import { useSession } from '../../lib/role';
import { colors, font } from '../../lib/theme';

export default function StreamTest() {
  const [text, setText] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState<unknown>(null);
  const abort = useRef<AbortController | null>(null);
  const { setSession } = useSession();

  async function run(kind: 'dev' | 'memo') {
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setText('');
    setError(null);
    setStatus('streaming…');
    setSession({ role: 'staff', athleteId: null, athleteName: null });
    try {
      await streamSse({
        url: kind === 'dev' ? `${API_URL}/dev/stream-test` : streamUrl(API_URL, 'memoStream', { id: 'TRIP-G12' }),
        method: kind === 'dev' ? 'GET' : 'POST',
        signal: ac.signal,
        onEvent: (ev) => {
          if (ev.type === 'delta') setText((t) => t + ev.text);
          if (ev.type === 'done') setStatus(`done (${ev.finish_reason})`);
          if (ev.type === 'error') setStatus(`error: ${ev.message}`);
        },
      });
    } catch (e) {
      if (!ac.signal.aborted) setError(e);
      setStatus('failed');
    }
  }

  return (
    <Screen>
      <Body>Text should appear word by word. If it all appears at once, streaming is buffered (see DECISIONS.md fallback).</Body>
      <Button title="Stream test (count to 10)" onPress={() => run('dev')} />
      <Button title="Stream memo for TRIP-G12" variant="secondary" onPress={() => run('memo')} />
      <Button title="Stop" variant="ghost" onPress={() => abort.current?.abort()} />
      <Body muted>Status: {status}</Body>
      {!!error && <ErrorState error={error} />}
      <Card>
        <Text style={{ fontSize: font.md, color: colors.text, fontFamily: 'Menlo' }}>{text || '…'}</Text>
      </Card>
    </Screen>
  );
}

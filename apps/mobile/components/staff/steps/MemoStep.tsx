/** Step 4 Memo (B-09): live SSE streaming via expo/fetch, Stop, unverified-sentence highlights. */
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View, type ScrollViewInstance } from 'react-native';
import { ESTIMATE_NOTE, streamUrl } from '@falcon/shared';
import { AiNotice, Banner, Button, Caption, Card, Row, SelectChip } from '../../ui';
import { errorMessage } from '../../../lib/api';
import { API_URL } from '../../../lib/config';
import { streamSse } from '../../../lib/sse';
import { qk } from '../../../lib/staff/queries';
import { colors, font } from '../../../lib/theme';
import { MarkdownLite } from '../MarkdownLite';
import type { StepProps } from './types';

type Status = 'idle' | 'streaming' | 'done' | 'stopped' | 'error';

function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function MemoStep({ detail }: StepProps) {
  const { trip } = detail;
  const qc = useQueryClient();
  const feasible = trip.packages.filter((p) => p.feasible);
  const [optionId, setOptionId] = useState<string | null>(trip.selected_option_id ?? feasible[0]?.option_id ?? null);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [unverified, setUnverified] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);

  // leaving the screen aborts the stream
  useEffect(() => () => abort.current?.abort(), []);

  const labelOf = (id: string) => trip.packages.find((p) => p.option_id === id)?.label ?? id;

  async function write() {
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setText('');
    setUnverified([]);
    setError(null);
    setStatus('streaming');
    let finished = false;
    try {
      await streamSse({
        url: streamUrl(API_URL, 'memoStream', { id: trip.trip_id }),
        method: 'POST',
        body: optionId ? { option_id: optionId } : {},
        signal: ac.signal,
        onEvent: (ev) => {
          if (ev.type === 'delta') setText((t) => t + ev.text);
          if (ev.type === 'done') {
            finished = true;
            setUnverified(ev.unverified_sentences);
            setStatus('done');
            void qc.invalidateQueries({ queryKey: qk.trip(trip.trip_id) });
          }
          if (ev.type === 'error') {
            finished = true;
            setError(ev.message);
            setStatus('error');
          }
        },
      });
      if (!finished && !ac.signal.aborted) {
        setError('The memo stream ended early. Keep the partial text or try again.');
        setStatus('error');
      }
    } catch (e) {
      if (ac.signal.aborted) {
        setStatus('stopped');
      } else {
        setError(errorMessage(e));
        setStatus('error');
      }
    }
  }

  const stop = () => {
    abort.current?.abort();
    setStatus('stopped');
  };

  const streaming = status === 'streaming';
  // show the live text while/after streaming in this session; otherwise the saved memo
  const showLive = status !== 'idle';
  const saved = trip.memo;
  const shownText = showLive ? text : saved?.markdown ?? '';
  const shownUnverified = showLive ? unverified : saved?.unverified_sentences ?? [];

  return (
    <View style={{ gap: 12 }}>
      {feasible.length > 1 && !streaming && (
        <View style={{ gap: 6 }}>
          <Caption>Write the memo for:</Caption>
          <Row>
            {feasible.map((p) => (
              <SelectChip
                key={p.option_id}
                label={`${p.label}${p.option_id === trip.selected_option_id ? ' (selected)' : ''}`}
                selected={optionId === p.option_id}
                onPress={() => setOptionId(p.option_id)}
              />
            ))}
          </Row>
        </View>
      )}

      {!showLive && saved && (
        <Caption>Generated {when(saved.generated_at)} for {labelOf(saved.option_id)} ({saved.option_id})</Caption>
      )}

      {streaming ? (
        <Button title="Stop" variant="ghost" onPress={stop} accessibilityHint="Stops writing; keeps the text so far" />
      ) : (
        <Button
          title={saved || text ? 'Regenerate memo' : 'Write memo'}
          variant={saved || text ? 'ghost' : 'primary'}
          onPress={write}
          disabled={!optionId}
          accessibilityHint="Streams a memo written from our computed itinerary and costs"
        />
      )}

      {streaming && (
        <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ActivityIndicator color={colors.orange} />
          <Text style={{ color: colors.orange, fontWeight: '700', fontSize: font.md }}>Writing…</Text>
        </View>
      )}
      {status === 'stopped' && <Banner tone="info" message="Stopped. The partial memo below was not saved." />}
      {status === 'error' && error && (
        <View style={{ gap: 6 }}>
          <AiNotice message={error} />
          <Button title="Retry" variant="secondary" onPress={write} />
        </View>
      )}

      {shownText ? (
        <Card>
          <ScrollView
            ref={scroll}
            nestedScrollEnabled
            style={{ maxHeight: 520 }}
            onContentSizeChange={() => { if (streaming) scroll.current?.scrollToEnd({ animated: true }); }}
          >
            <MarkdownLite text={shownText} highlight={streaming ? [] : shownUnverified} />
          </ScrollView>
          {!streaming && shownUnverified.length > 0 && (
            <View style={{ backgroundColor: '#FFE2A8', borderRadius: 8, padding: 8 }}>
              <Text style={{ color: colors.brown, fontSize: font.sm, fontWeight: '700' }}>
                ⚠ Unverified — {shownUnverified.length} highlighted sentence{shownUnverified.length > 1 ? 's contain' : ' contains'} a figure not in our data.
              </Text>
            </View>
          )}
        </Card>
      ) : (
        !streaming && <Caption>No memo yet. The AI writes prose only from the facts our code computed.</Caption>
      )}
      <Caption>{ESTIMATE_NOTE} Costs are estimates.</Caption>
    </View>
  );
}

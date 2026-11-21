/** AI Usage & Accuracy (B-15). Proves token discipline and measured accuracy. Numbers straight from the API. */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { AccuracyReport, AiUsageSummary } from '@falcon/shared';
import { Banner, Caption, Card, Chip, Empty, ErrorState, Loading, Row, Screen, Segmented } from '../../components/ui';
import { Bar } from '../../components/staff/Bar';
import { Section } from '../../components/staff/Section';
import { useAiAccuracy, useAiUsage } from '../../lib/staff/queries';
import { colors, font, radius, space, TAP } from '../../lib/theme';

const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;
const n = (x: number) => x.toLocaleString('en-US');
function when(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function Tile({ label, value, big, tone }: { label: string; value: string; big?: boolean; tone?: string }) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={{ flexBasis: big ? '100%' : '47%', flexGrow: 1, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: 2 }}
    >
      <Text style={{ fontSize: font.sm, color: colors.muted, fontWeight: '700' }}>{label}</Text>
      <Text style={{ fontSize: big ? 48 : font.xl, fontWeight: '900', color: tone ?? colors.brown, fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
}

function Accuracy({ report }: { report: AccuracyReport | null }) {
  const [showFailures, setShowFailures] = useState(false);
  if (!report) return <Empty title="No accuracy run yet" hint="Run `npm run accuracy` on the server, then pull to refresh." />;
  const tone = (x: number) => (x >= 0.9 ? colors.ok : x >= 0.7 ? colors.warn : colors.danger);
  return (
    <View style={{ gap: space.md }}>
      <Caption>Run at {when(report.run_at)} · {report.cases_run} cases · {report.mock ? 'mock AI' : 'live AI'}</Caption>
      {report.mock && <Banner tone="warn" message="This run used mock AI output — run with AIVANA_MOCK=0 for real accuracy." />}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
        <Tile label="Overall field accuracy" value={pct(report.overall_accuracy)} big tone={tone(report.overall_accuracy)} />
        <Tile label="Exact-match requests" value={pct(report.exact_match_rate)} tone={tone(report.exact_match_rate)} />
        <Tile label="Recommendation valid ID" value={pct(report.recommendation_valid_id_rate)} tone={tone(report.recommendation_valid_id_rate)} />
        <Tile label="Fact-guard pass rate" value={pct(report.fact_guard_pass_rate)} tone={tone(report.fact_guard_pass_rate)} />
      </View>
      <Card>
        <Section title="Per field">
          {report.per_field.map((f) => (
            <Bar key={f.field} label={f.field.replace(/_/g, ' ')} ratio={f.accuracy} right={`${f.correct}/${f.total}`} />
          ))}
        </Section>
      </Card>
      <Card>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showFailures }}
          accessibilityLabel={`${report.failures.length} failures. ${showFailures ? 'Hide' : 'Show'}`}
          onPress={() => setShowFailures((v) => !v)}
          style={{ minHeight: TAP, justifyContent: 'center' }}
        >
          <Text style={{ fontSize: font.lg, fontWeight: '800', color: colors.brown }}>
            {showFailures ? '▾' : '▸'} Failures ({report.failures.length})
          </Text>
        </Pressable>
        {showFailures && report.failures.map((f, i) => (
          <View key={i} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 6 }}>
            <Text style={{ fontWeight: '700', color: colors.text }}>{f.case_id} · {f.field}</Text>
            <Caption>expected: {f.expected}</Caption>
            <Caption tone="danger">got: {f.got}</Caption>
          </View>
        ))}
      </Card>
    </View>
  );
}

function Usage({ u }: { u: AiUsageSummary }) {
  const t = u.totals;
  return (
    <View style={{ gap: space.md }}>
      {u.mock_mode && <Banner tone="warn" message="Mock mode — canned AI output, no credits spent. Calls are still logged." />}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
        <Tile label="Calls" value={n(t.calls)} />
        <Tile label="Errors" value={n(t.errors)} tone={t.errors ? colors.danger : colors.ok} />
        <Tile label="Tokens in" value={n(t.input_tokens)} />
        <Tile label="Tokens out" value={n(t.output_tokens)} />
        <Tile label="Credits" value={String(Math.round(t.credits * 1000) / 1000)} />
        <Tile label="Avg latency" value={`${n(t.avg_latency_ms)} ms`} />
      </View>

      <Card>
        <Section title="By feature" hint="Small average input tokens = compact prompts (no full roster, trimmed history).">
          {u.by_feature.length === 0 && <Caption>No AI calls yet. Try a parse or a recommendation.</Caption>}
          {u.by_feature.length > 0 && (
            <View style={{ flexDirection: 'row', paddingBottom: 4 }}>
              {['Feature', 'Calls', 'Avg in', 'Out', 'Credits'].map((h, i) => (
                <Text key={h} style={{ flex: i === 0 ? 1.4 : 1, textAlign: i === 0 ? 'left' : 'right', fontSize: font.sm, fontWeight: '800', color: colors.brown }}>{h}</Text>
              ))}
            </View>
          )}
          {u.by_feature.map((f) => (
            <View
              key={f.feature}
              accessible
              accessibilityLabel={`${f.feature}: ${f.calls} calls, average ${f.avg_input_tokens} input tokens, ${f.output_tokens} output tokens, ${f.credits} credits`}
              style={{ flexDirection: 'row', paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}
            >
              <Text style={{ flex: 1.4, fontSize: font.md, fontWeight: '700', color: colors.text }}>{f.feature}</Text>
              <Text style={{ flex: 1, textAlign: 'right', fontSize: font.md, color: colors.text }}>{n(f.calls)}</Text>
              <Text style={{ flex: 1, textAlign: 'right', fontSize: font.md, color: colors.ok, fontWeight: '800' }}>{n(f.avg_input_tokens)}</Text>
              <Text style={{ flex: 1, textAlign: 'right', fontSize: font.md, color: colors.text }}>{n(f.output_tokens)}</Text>
              <Text style={{ flex: 1, textAlign: 'right', fontSize: font.md, color: colors.text }}>{Math.round(f.credits * 1000) / 1000}</Text>
            </View>
          ))}
        </Section>
      </Card>

      <Card>
        <Section title={`Recent calls (${u.recent.length})`}>
          {u.recent.length === 0 && <Caption>No calls logged yet.</Caption>}
          {u.recent.map((c) => (
            <View
              key={c.id}
              accessible
              accessibilityLabel={`${c.feature} ${c.ok ? 'ok' : `error ${c.error_code}`}, ${c.input_tokens} in, ${c.output_tokens} out, ${c.latency_ms} milliseconds`}
              style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 6, gap: 2 }}
            >
              <Row gap={6}>
                <Text style={{ fontWeight: '800', color: colors.text, fontSize: font.md }}>{c.feature}</Text>
                {c.ok ? <Chip label="ok" tone="ok" /> : <Chip label={c.error_code || 'error'} tone="danger" />}
                {c.mock && <Chip label="mock" tone="neutral" />}
                {c.attempts > 1 && <Chip label={`${c.attempts} attempts`} tone="warn" />}
              </Row>
              <Caption>
                {n(c.input_tokens)} in · {n(c.output_tokens)} out · {n(c.latency_ms)} ms · {c.endpoint} · {when(c.created_at)}
              </Caption>
              {c.request_id ? <Caption>req {c.request_id}</Caption> : null}
            </View>
          ))}
        </Section>
      </Card>
    </View>
  );
}

export default function Ai() {
  const [tab, setTab] = useState<'accuracy' | 'usage'>('accuracy');
  const usage = useAiUsage();
  const accuracy = useAiAccuracy();
  const q = tab === 'usage' ? usage : accuracy;
  return (
    <Screen onRefresh={() => { void usage.refetch(); void accuracy.refetch(); }} refreshing={usage.isRefetching || accuracy.isRefetching}>
      <Segmented
        accessibilityLabel="AI report"
        value={tab}
        onChange={setTab}
        options={[{ value: 'accuracy', label: 'Accuracy' }, { value: 'usage', label: 'Usage' }]}
      />
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : tab === 'usage' ? (
        usage.data ? <Usage u={usage.data} /> : null
      ) : (
        <Accuracy report={accuracy.data ?? null} />
      )}
    </Screen>
  );
}

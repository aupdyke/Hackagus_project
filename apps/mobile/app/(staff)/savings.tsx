/**
 * "Get back under budget" (B-14). Code lists candidate swaps + savings; AI picks a set by ID and explains.
 * Every number shown comes from code fields. Totals are recomputed by the server when applied.
 */
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { ESTIMATE_NOTE, formatUSD, type SavingsCandidate } from '@falcon/shared';
import { AiNotice, Banner, Button, Caption, Card, Chip, Empty, ErrorState, Loading, Row, Screen } from '../../components/ui';
import { Money } from '../../components/staff/Money';
import { SourceChips } from '../../components/staff/RecommendationPanel';
import { Section } from '../../components/staff/Section';
import { errorMessage, isAiError } from '../../lib/api';
import { useApplySavings, useSavings } from '../../lib/staff/queries';
import { colors, font, radius, space, TAP } from '../../lib/theme';

const KIND: Record<SavingsCandidate['kind'], { icon: 'swap-horizontal' | 'people' | 'bed'; label: string }> = {
  switch_package: { icon: 'swap-horizontal', label: 'Switch package' },
  reduce_travelers: { icon: 'people', label: 'Fewer travelers' },
  cheaper_hotel: { icon: 'bed', label: 'Cheaper hotel' },
};

export default function Savings() {
  const savings = useSavings();
  const apply = useApplySavings();
  const [checked, setChecked] = useState<Set<string>>(new Set());

  // fresh suggestions every time the screen is opened
  useFocusEffect(useCallback(() => { savings.mutate(); apply.reset(); }, [])); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (savings.data) setChecked(new Set(savings.data.selected_candidate_ids));
  }, [savings.data]);

  if (savings.isPending || (savings.isIdle && !savings.data)) return <Loading label="Finding savings…" />;
  if (savings.isError) {
    return (
      <Screen>
        {isAiError(savings.error) ? <AiNotice message={errorMessage(savings.error)} /> : <ErrorState error={savings.error} onRetry={() => savings.mutate()} />}
        <Button title="Try again" variant="ghost" onPress={() => savings.mutate()} />
        <Button title="Back to Season" variant="ghost" onPress={() => router.navigate('/(staff)/season')} />
      </Screen>
    );
  }
  const r = savings.data!;
  const aiSet = new Set(r.selected_candidate_ids);
  const sameAsAi = checked.size === aiSet.size && [...checked].every((id) => aiSet.has(id));

  const toggle = (id: string) => {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id); else next.add(id);
    setChecked(next);
  };

  const onApply = () =>
    Alert.alert('Apply selected savings?', `${checked.size} change${checked.size === 1 ? '' : 's'} will be applied to the trips and every total recomputed by code.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Apply',
        onPress: () => apply.mutate([...checked], { onSuccess: () => router.navigate('/(staff)/season') }),
      },
    ]);

  return (
    <Screen>
      <Card>
        <Text style={{ fontSize: font.md, color: colors.muted, fontWeight: '700' }}>Projected season total</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' }}>
          <Money value={r.projected_before} size="md" label="Before" />
          <Ionicons name="arrow-forward" size={24} color={colors.brown} />
          <Money value={r.projected_after} size="lg" label="After" color={r.back_under_budget ? colors.ok : colors.danger} />
        </View>
        <Row>
          {r.back_under_budget ? <Chip label="Back under budget ✓" tone="ok" /> : <Chip label="Still over budget" tone="danger" />}
          <Chip label={`Saves ${formatUSD(r.total_savings)} (estimate)`} tone="info" />
        </Row>
        <Caption>For the AI-selected set. Totals are computed by code.</Caption>
      </Card>

      <Card>
        <Section title="Why these">
          <SourceChips source={r.source} factGuard={r.fact_guard} aiLabel="AI selection" templateLabel="Code selection (AI unavailable)" />
          <Text style={{ fontSize: font.md, color: colors.text, lineHeight: 22 }}>{r.explanation}</Text>
        </Section>
      </Card>

      <Section title={`Candidates (${r.candidates.length})`} hint="Check the changes to apply. AI picks are pre-checked.">
        {!r.candidates.length && <Empty title="No savings found" hint="Every upcoming trip is already at its cheapest feasible option." />}
        {r.candidates.map((c) => {
          const on = checked.has(c.candidate_id);
          const k = KIND[c.kind];
          return (
            <Pressable
              key={c.candidate_id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${c.description}. ${k.label}. Saves estimate ${formatUSD(c.savings)}.${aiSet.has(c.candidate_id) ? ' AI pick.' : ''}`}
              onPress={() => toggle(c.candidate_id)}
              style={({ pressed }) => ({
                flexDirection: 'row', gap: space.md, alignItems: 'center', padding: space.md, minHeight: TAP + 16,
                backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: on ? 2 : 1, borderColor: on ? colors.orange : colors.border,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Ionicons name={on ? 'checkbox' : 'square-outline'} size={28} color={on ? colors.orange : colors.muted} />
              <View style={{ flex: 1, gap: 4 }}>
                <Row gap={6}>
                  <Ionicons name={k.icon} size={16} color={colors.brown} />
                  <Text style={{ fontSize: font.sm, color: colors.muted, fontWeight: '700' }}>{k.label} · {c.candidate_id}</Text>
                  {aiSet.has(c.candidate_id) && <Chip label="AI pick" tone="brand" />}
                </Row>
                <Text style={{ fontSize: font.md, color: colors.text, fontWeight: '600' }}>{c.description}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: font.sm, color: colors.ok, fontWeight: '700' }}>saves</Text>
                <Money value={c.savings} size="sm" color={colors.ok} />
              </View>
            </Pressable>
          );
        })}
      </Section>

      {!sameAsAi && <Banner tone="info" message="Totals will be recomputed when you apply." />}
      {apply.isError && <Banner tone="danger" message={errorMessage(apply.error)} />}
      <Button
        title={`Apply selected (${checked.size})`}
        onPress={onApply}
        disabled={checked.size === 0}
        loading={apply.isPending}
        accessibilityHint="Switches packages / travelers on the chosen trips, then returns to Season"
      />
      <Button title="Cancel" variant="ghost" onPress={() => router.navigate('/(staff)/season')} />
      <Caption>{ESTIMATE_NOTE}</Caption>
    </Screen>
  );
}

/** Trip workflow (B-02): header, 7-step stepper, active step. */
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { formatClock, formatDate } from '@falcon/shared';
import { Caption, ErrorState, Loading, Row, Screen } from '../../../components/ui';
import { StatusChip } from '../../../components/staff/StatusChip';
import { Stepper } from '../../../components/staff/Stepper';
import { STEPS, disabledReason, initialStep, type StepKey, type StepProps } from '../../../components/staff/steps/types';
import { RequestStep } from '../../../components/staff/steps/RequestStep';
import { PackagesStep } from '../../../components/staff/steps/PackagesStep';
import { WhatIfStep } from '../../../components/staff/steps/WhatIfStep';
import { MemoStep } from '../../../components/staff/steps/MemoStep';
import { RoomingStep } from '../../../components/staff/steps/RoomingStep';
import { PublishStep } from '../../../components/staff/steps/PublishStep';
import { ActualsStep } from '../../../components/staff/steps/ActualsStep';
import { useTrip } from '../../../lib/staff/queries';
import { colors, font } from '../../../lib/theme';

const COMPONENTS: Record<StepKey, (p: StepProps) => ReactNode> = {
  request: RequestStep,
  packages: PackagesStep,
  whatif: WhatIfStep,
  memo: MemoStep,
  rooming: RoomingStep,
  publish: PublishStep,
  actuals: ActualsStep,
};

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useTrip(id);
  const [step, setStep] = useState<StepKey | null>(null);

  // pick the initial step from status once the trip has loaded
  useEffect(() => {
    if (q.data && step == null) setStep(initialStep(q.data.trip.status));
  }, [q.data, step]);

  if (q.isLoading) return <Loading label="Loading trip…" />;
  if (q.isError) return <Screen><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;
  if (!q.data) return <Loading />;
  const detail = q.data;
  const { trip, game } = detail;
  let current = step ?? initialStep(trip.status);
  // if a step became unavailable (e.g. request re-submitted), fall back to the closest enabled one
  if (disabledReason(current, trip)) current = initialStep(trip.status);
  if (disabledReason(current, trip)) current = 'request';
  const Active = COMPONENTS[current];
  const def = STEPS.find((s) => s.key === current)!;
  const goTo = (s: StepKey) => setStep(s);

  return (
    <Screen keyboard onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <Stack.Screen options={{ title: `at ${game.opponent}` }} />
      <View style={{ gap: 4 }}>
        <Text accessibilityRole="header" style={{ fontSize: font.xxl, fontWeight: '800', color: colors.brown }}>at {game.opponent}</Text>
        <Text style={{ fontSize: font.md, color: colors.muted }}>
          {formatDate(game.date)} · {formatClock(game.kickoff_local)} kickoff · {game.stadium_name}
        </Text>
        <Row>
          <StatusChip status={trip.status} />
          <Caption>{game.city}, {game.state} · ~{game.road_miles_one_way} mi one way</Caption>
        </Row>
      </View>
      <Stepper trip={trip} current={current} onChange={goTo} />
      <View style={{ gap: 2 }}>
        <Text accessibilityRole="header" style={{ fontSize: font.xl, fontWeight: '800', color: colors.brown }}>
          {STEPS.indexOf(def) + 1}. {def.label}
        </Text>
        <Caption>{def.hint}</Caption>
      </View>
      <Active detail={detail} goTo={goTo} />
    </Screen>
  );
}

/**
 * Step 3 What-if chat (B-08). The model returns a structured patch; code applies it, recomputes and diffs.
 * Op chips and the diff are rendered from code fields only — never parsed from the reply text.
 */
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { formatDayTime, formatUSD, type PatchOp, type TravelPackage } from '@falcon/shared';
import { AiNotice, Banner, Button, Caption, Chip, Row, SelectChip } from '../../ui';
import { errorMessage } from '../../../lib/api';
import { useWhatIf } from '../../../lib/staff/queries';
import { colors, font, radius, TAP } from '../../../lib/theme';
import { ChatBubble, TypingBubble } from '../ChatBubble';
import { DiffTable } from '../DiffTable';
import type { StepProps } from './types';

const SUGGESTIONS = ['Leave three players home', 'Cap lodging at $9,000', 'No equipment truck', "Can't leave before 2 PM Friday"];

const FIELD: Record<string, string> = { players: 'Players', coaches: 'Coaches', support_staff: 'Support staff' };
const CAP: Record<string, string> = { lodging: 'Lodging', meals: 'Meals', bus: 'Bus', total: 'Total' };
const PREF: Record<string, string> = {
  none: 'No preference', lowest_cost: 'Prefer lowest cost', closest_to_stadium: 'Prefer closest to stadium',
  team_meal_service: 'Prefer hotel team meals', earlier_arrival: 'Prefer earlier arrival',
};

/** Human words for an op, built by code. */
export function opLabel(op: PatchOp, packages: TravelPackage[]): string {
  switch (op.op) {
    case 'set_count':
      return `${FIELD[op.field]} = ${op.value}`;
    case 'adjust_count':
      return `${FIELD[op.field]} ${op.delta < 0 ? '−' : '+'}${Math.abs(op.delta)}`;
    case 'set_cap':
      return `${CAP[op.category]} cap ${formatUSD(op.max)}`;
    case 'clear_cap':
      return `${CAP[op.category]} cap removed`;
    case 'set_departure_constraint':
      return op.constraint.kind === 'none' || !op.constraint.datetime_local
        ? 'No departure limit'
        : `${op.constraint.kind === 'not_before' ? 'Not before' : 'Not after'} ${formatDayTime(op.constraint.datetime_local)}`;
    case 'exclude_hotel': {
      const name = packages.find((p) => p.hotel_id === op.hotel_id)?.hotel_name;
      return `Exclude ${name ?? op.hotel_id}`;
    }
    case 'set_equipment_truck':
      return op.value ? 'Truck on' : 'Truck off';
    case 'prefer':
      return PREF[op.criterion] ?? op.criterion;
  }
}

function rejectedLabel(op: unknown): string {
  if (op && typeof op === 'object' && 'op' in op) return String((op as { op: unknown }).op).replace(/_/g, ' ');
  return 'change';
}

type WhatIfResult = NonNullable<ReturnType<typeof useWhatIf>['data']>;

export function WhatIfStep({ detail, goTo }: StepProps) {
  const { trip } = detail;
  const whatIf = useWhatIf(trip.trip_id);
  const [text, setText] = useState('');
  const [pendingMsg, setPendingMsg] = useState<string | null>(null);
  /** response details keyed by the index of the assistant turn they belong to */
  const [results, setResults] = useState<Record<number, WhatIfResult>>({});
  const editable = trip.status !== 'completed';

  const send = (message: string) => {
    const m = message.trim();
    if (!m || whatIf.isPending) return;
    setPendingMsg(m);
    setText('');
    whatIf.mutate(m, {
      onSuccess: (r) => {
        const idx = r.trip.whatif_history.length - 1;
        setResults((prev) => ({ ...prev, [idx]: r }));
      },
      onError: () => setText(m),
      onSettled: () => setPendingMsg(null),
    });
  };

  const history = trip.whatif_history;
  return (
    <View style={{ gap: 12 }}>
      {!editable && <Banner tone="info" message="This trip is completed — what-if changes are turned off." />}
      {history.length === 0 && !pendingMsg && (
        <Caption>Try a suggestion below. Nothing is changed unless code can apply it, and every package is recomputed.</Caption>
      )}

      {history.map((turn, i) => {
        const r = results[i];
        return (
          <View key={i} style={{ gap: 6 }}>
            <ChatBubble role={turn.role} text={turn.content}>
              {r && turn.role === 'assistant' ? (
                <View style={{ gap: 8 }}>
                  {r.patch_ops.length > 0 && (
                    <Row gap={6}>
                      {r.patch_ops.map((op, j) => <Chip key={j} label={opLabel(op, trip.packages)} tone={r.applied ? 'ok' : 'neutral'} />)}
                    </Row>
                  )}
                  {r.rejected_ops.map((rj, j) => (
                    <View key={j} style={{ backgroundColor: '#FFF1DE', borderRadius: radius.sm, padding: 8 }}>
                      <Caption tone="warn">Not applied ({rejectedLabel(rj.op)}): {rj.reason}</Caption>
                    </View>
                  ))}
                  {r.applied && <DiffTable diff={r.diff} packages={r.trip.packages} />}
                </View>
              ) : null}
            </ChatBubble>
            {r && turn.role === 'assistant' && r.needs_clarification && r.clarifying_question && r.clarifying_question !== turn.content && (
              <ChatBubble role="assistant" text={r.clarifying_question} />
            )}
            {r && turn.role === 'assistant' && r.source === 'fallback' && (
              <View style={{ gap: 6 }}>
                <AiNotice message="AI is unavailable — edit the request form instead. Packages and costs still work." />
                <Button title="Open the Request form" variant="ghost" onPress={() => goTo('request')} />
              </View>
            )}
            {r && turn.role === 'assistant' && r.applied && (
              <Button title="View updated packages" variant="ghost" onPress={() => goTo('packages')} />
            )}
          </View>
        );
      })}

      {pendingMsg && (
        <>
          <ChatBubble role="user" text={pendingMsg} />
          <TypingBubble label="Working out the change…" />
        </>
      )}
      {whatIf.isError && (
        <View style={{ gap: 6 }}>
          <AiNotice message={errorMessage(whatIf.error)} />
          <Button title="Edit the request form instead" variant="ghost" onPress={() => goTo('request')} />
        </View>
      )}

      {editable && (
        <>
          <Row gap={8}>
            {SUGGESTIONS.map((s) => <SelectChip key={s} label={s} onPress={() => send(s)} disabled={whatIf.isPending} />)}
          </Row>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
            <TextInput
              accessibilityLabel="What-if message"
              value={text}
              onChangeText={setText}
              placeholder='e.g. "What if we cap meals at $5,000?"'
              placeholderTextColor={colors.muted}
              multiline
              maxLength={500}
              editable={!whatIf.isPending}
              onSubmitEditing={() => send(text)}
              style={{ flex: 1, minHeight: TAP, maxHeight: 120, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingTop: 12, fontSize: font.md, color: colors.text }}
            />
            <View style={{ width: 96 }}>
              <Button title="Send" onPress={() => send(text)} disabled={!text.trim()} loading={whatIf.isPending} />
            </View>
          </View>
        </>
      )}
      <Caption>History is saved with the trip. All totals are estimates.</Caption>
    </View>
  );
}

/**
 * Human review of an AI parse (B-04). Hackathon rule: the parsed request is shown for confirmation and
 * editing before any cost is computed. Nothing is submitted until staff press Confirm.
 */
import { Text, View } from 'react-native';
import type { Game, ParseResult, TripRequest } from '@falcon/shared';
import { AiNotice, Banner, Button, Card, Chip, Row } from '../ui';
import { colors, font } from '../../lib/theme';
import { RequestForm, constraintToDraft, type RequestDraft } from './RequestForm';

const FIELD_LABEL: Record<string, string> = {
  opponent: 'Opponent',
  players: 'Players',
  coaches: 'Coaches',
  support_staff: 'Support staff',
  departure_constraint: 'Departure limit',
  include_equipment_truck: 'Equipment truck',
};

export function ParseReview({ game, result, base, onConfirm, submitting, serverError, onStartOver }: {
  game: Game;
  result: ParseResult;
  base: TripRequest | null;
  onConfirm: (req: TripRequest) => void;
  submitting?: boolean;
  serverError?: string | null;
  onStartOver: () => void;
}) {
  const { draft } = result;
  const initial: Partial<RequestDraft> = {
    players: draft.players,
    coaches: draft.coaches,
    support_staff: draft.support_staff,
    include_equipment_truck: draft.include_equipment_truck,
    notes: draft.notes,
    ...constraintToDraft(draft.departure_constraint, game.date),
  };
  const wrongGame = draft.game_id != null && draft.game_id !== game.game_id;
  const opponentAmbiguities = result.ambiguities.filter((a) => a.field === 'opponent');
  const missing = result.missing_fields.filter((f) => f !== 'opponent');

  return (
    <View style={{ gap: 12 }}>
      <Card style={{ borderColor: colors.orange, borderWidth: 2 }}>
        <Row>
          <Text style={{ fontSize: font.lg, fontWeight: '800', color: colors.brown }}>Review before computing costs</Text>
        </Row>
        <Row>
          {result.source === 'ai' ? <Chip label="Parsed by AI" tone="brand" /> : <Chip label="AI unavailable — fill in by hand" tone="warn" />}
          {missing.length > 0 && <Chip label={`${missing.length} to fill in`} tone="warn" />}
        </Row>
        <Text style={{ fontSize: font.sm, color: colors.muted }}>
          Check every field. Costs are only computed after you press “Confirm &amp; compute packages”.
        </Text>
        {missing.length > 0 && (
          <Text style={{ fontSize: font.sm, color: colors.orange, fontWeight: '700' }}>
            Missing: {missing.map((f) => FIELD_LABEL[f] ?? f).join(', ')}
          </Text>
        )}
      </Card>
      {result.source === 'fallback' && result.notice ? <AiNotice message={result.notice} /> : null}
      {wrongGame && (
        <Banner
          tone="warn"
          message={`Your text mentions ${draft.opponent_text || 'another opponent'} — this screen plans at ${game.opponent}. We kept ${game.opponent}.`}
        />
      )}
      {opponentAmbiguities.map((a, i) => <Banner key={i} tone="warn" message={a.message} />)}
      <RequestForm
        game={game}
        initial={initial}
        missing={missing}
        ambiguities={result.ambiguities}
        base={base}
        onSubmit={onConfirm}
        submitting={submitting}
        serverError={serverError}
        submitLabel="Confirm & compute packages"
      />
      <Button title="Start over" variant="ghost" onPress={onStartOver} accessibilityHint="Clears the parsed draft" />
    </View>
  );
}

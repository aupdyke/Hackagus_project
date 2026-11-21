/** Step 1 Request (B-03 form mode, B-04 free text → parse → human review). */
import { useState } from 'react';
import { View } from 'react-native';
import type { ParseResult, TripRequest } from '@falcon/shared';
import { AiNotice, Banner, Button, Caption, Card, ErrorState, Field, Segmented } from '../../ui';
import { errorMessage, isAiError } from '../../../lib/api';
import { useParseRequest, useSubmitRequest } from '../../../lib/staff/queries';
import { DEFAULT_DRAFT, RequestForm, requestToDraft } from '../RequestForm';
import { ParseReview } from '../ParseReview';
import type { StepProps } from './types';

const PLACEHOLDER = "Ohio trip: 68 players, 12 coaches, 11 support staff, bring the equipment truck, can't leave before 2 PM Friday";

export function RequestStep({ detail, goTo }: StepProps) {
  const { trip, game } = detail;
  const [mode, setMode] = useState<'form' | 'text'>('form');
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [parseKey, setParseKey] = useState(0);
  const submit = useSubmitRequest(game.game_id);
  const parse = useParseRequest();

  if (trip.status === 'completed') {
    return <Banner tone="info" message="This trip is completed, so its request can no longer be edited." />;
  }

  const onSubmit = (req: TripRequest) =>
    submit.mutate(req, { onSuccess: () => { setParsed(null); goTo('packages'); } });
  const serverError = submit.isError ? errorMessage(submit.error) : null;

  const runParse = () => {
    setParsed(null);
    parse.mutate(text.trim(), {
      onSuccess: (r) => { setParsed(r); setParseKey((k) => k + 1); submit.reset(); },
    });
  };

  return (
    <View style={{ gap: 12 }}>
      {trip.status === 'approved' && <Banner tone="warn" message="Changing the request moves this approved trip back to draft — it will need re-approval." />}
      {trip.status === 'published' && <Banner tone="warn" message="This trip is published. After changing the request, re-publish to notify athletes." />}
      <Segmented
        accessibilityLabel="Request input mode"
        value={mode}
        onChange={(m) => { setMode(m); submit.reset(); }}
        options={[{ value: 'form', label: 'Form' }, { value: 'text', label: 'Free text (AI)' }]}
      />

      {mode === 'form' ? (
        <RequestForm
          game={game}
          initial={trip.request ? requestToDraft(trip.request, game.date) : DEFAULT_DRAFT}
          base={trip.request}
          onSubmit={onSubmit}
          submitting={submit.isPending}
          serverError={serverError}
          submitLabel={trip.request ? 'Update request & recompute' : 'Compute packages'}
        />
      ) : parsed ? (
        <ParseReview
          key={parseKey}
          game={game}
          result={parsed}
          base={trip.request}
          onConfirm={onSubmit}
          submitting={submit.isPending}
          serverError={serverError}
          onStartOver={() => { setParsed(null); submit.reset(); }}
        />
      ) : (
        <View style={{ gap: 12 }}>
          <Card>
            <Field
              label="Describe the trip in plain words"
              value={text}
              onChangeText={setText}
              multiline
              placeholder={PLACEHOLDER}
            />
            <Caption>AI only extracts the words; code matches the opponent and works out dates. You review everything before costs are computed.</Caption>
            <Button
              title="Parse with AI"
              onPress={runParse}
              loading={parse.isPending}
              disabled={text.trim().length < 3}
              accessibilityHint="Turns your text into a draft request for review. Does not compute costs."
            />
            {text.trim().length === 0 && (
              <Button title="Use example sentence" variant="ghost" onPress={() => setText(PLACEHOLDER.replace('Ohio', game.opponent))} />
            )}
          </Card>
          {parse.isError && (isAiError(parse.error) ? (
            <View style={{ gap: 8 }}>
              <AiNotice message={errorMessage(parse.error)} />
              <Button title="Use the form instead" variant="secondary" onPress={() => setMode('form')} />
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              <ErrorState error={parse.error} onRetry={runParse} />
              <Button title="Use the form instead" variant="ghost" onPress={() => setMode('form')} />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/** Step 7 Actuals (B-12): staff enter real costs after the trip; code computes variance vs plan. */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { BudgetVsActual } from '@falcon/shared';
import { Banner, Button, Caption, Card, Empty, ErrorState, Field, Loading } from '../../ui';
import { errorMessage } from '../../../lib/api';
import { useBudgetVsActual, usePostActuals } from '../../../lib/staff/queries';
import { BudgetTable } from '../BudgetTable';
import { Section } from '../Section';
import type { StepProps } from './types';

const CATS = ['bus', 'equipment', 'hotel', 'meals', 'other'] as const;
type Cat = (typeof CATS)[number];
const LABEL: Record<Cat, string> = { bus: 'Bus', equipment: 'Equipment truck', hotel: 'Hotel', meals: 'Meals', other: 'Other' };

function prefill(bva: BudgetVsActual | undefined): Record<Cat, string> {
  const out = { bus: '', equipment: '', hotel: '', meals: '', other: '' };
  for (const l of bva?.lines ?? []) if (l.category !== 'contingency' && l.actual != null) out[l.category] = String(l.actual);
  return out;
}

export function ActualsStep({ detail, goTo }: StepProps) {
  const { trip } = detail;
  const ready = !!trip.selected_option_id && (trip.status === 'published' || trip.status === 'completed');
  const q = useBudgetVsActual(trip.trip_id, ready);
  const post = usePostActuals(trip.trip_id);
  const [vals, setVals] = useState<Record<Cat, string>>(prefill(undefined));
  const [notes, setNotes] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (q.data && !loaded) { setVals(prefill(q.data)); setLoaded(true); }
  }, [q.data, loaded]);

  if (!ready) {
    return (
      <Empty
        title="Actuals come after the trip"
        hint={!trip.selected_option_id ? 'Select a package, approve and publish the trip first.' : 'Publish the trip first. After it happens, enter what was actually spent here.'}
        action={<Button title="Go to Approve & Publish" variant="ghost" onPress={() => goTo(trip.selected_option_id ? 'publish' : 'packages')} />}
      />
    );
  }
  if (q.isLoading) return <Loading label="Loading budget vs actual…" />;

  const errors: Partial<Record<Cat, string>> = {};
  for (const c of CATS) {
    const v = vals[c].trim();
    if (v === '') errors[c] = 'Enter an amount (0 if none)';
    else if (!Number.isFinite(Number(v))) errors[c] = 'Enter a number';
    else if (Number(v) < 0) errors[c] = 'Must be $0 or more';
  }
  const valid = Object.keys(errors).length === 0;
  const anyTyped = CATS.some((c) => vals[c].trim() !== '');

  const save = () => {
    if (!valid) return;
    setSaved(false);
    post.mutate(
      { bus: Number(vals.bus), equipment: Number(vals.equipment), hotel: Number(vals.hotel), meals: Number(vals.meals), other: Number(vals.other), notes: notes.trim() },
      { onSuccess: () => setSaved(true) },
    );
  };

  const bva = post.data ?? q.data;
  return (
    <View style={{ gap: 12 }}>
      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {bva && (
        <Card>
          <Section title="Budget vs actual">
            <BudgetTable bva={bva} />
          </Section>
        </Card>
      )}
      {saved && <Banner tone="ok" message="Actuals saved. The trip is marked completed and the season budget is updated." onDismiss={() => setSaved(false)} />}
      {post.isError && <Banner tone="danger" message={errorMessage(post.error)} />}
      <Card>
        <Section title="Enter actual costs" hint="From invoices and receipts. These are real amounts, not estimates.">
          {CATS.map((c) => (
            <Field
              key={c}
              label={LABEL[c]}
              prefix="$"
              value={vals[c]}
              onChangeText={(t) => setVals({ ...vals, [c]: t.replace(/[^0-9.]/g, '') })}
              keyboardType="decimal-pad"
              placeholder="0.00"
              error={anyTyped ? errors[c] : null}
            />
          ))}
          <Field label="Notes (optional)" value={notes} onChangeText={setNotes} multiline placeholder="e.g. Extra hotel night for the equipment crew" />
          <Button title="Save actuals" onPress={save} disabled={!valid} loading={post.isPending} />
          {!valid && <Caption>Fill in all five amounts (use 0 when there was no cost).</Caption>}
        </Section>
      </Card>
    </View>
  );
}

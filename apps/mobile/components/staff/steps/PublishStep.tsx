/** Step 6 Approve & Publish (B-11): summary, approve → publish → re-publish, packets (PDF) and share link. */
import { useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import type { Trip } from '@falcon/shared';
import { Banner, Button, Caption, Card, Chip, Row, SelectChip } from '../../ui';
import { errorMessage } from '../../../lib/api';
import { sharePacketPdf, shareReadOnlyLink } from '../../../lib/staff/packet';
import { useApprove, useAthletes, usePublish } from '../../../lib/staff/queries';
import { colors, font } from '../../../lib/theme';
import { Money } from '../Money';
import { Section } from '../Section';
import type { StepProps } from './types';

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
const hasUnpublishedChanges = (t: Trip) => !!t.published_at && new Date(t.updated_at).getTime() > new Date(t.published_at).getTime();

export function PublishStep({ detail, goTo }: StepProps) {
  const { trip, game } = detail;
  const id = trip.trip_id;
  const approve = useApprove(id);
  const publish = usePublish(id);
  const athletes = useAthletes();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger' | 'info'; text: string } | null>(null);
  const [previewAthlete, setPreviewAthlete] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const pkg = trip.packages.find((p) => p.option_id === trip.selected_option_id) ?? null;
  const flags = pkg?.risk_flags ?? [];
  const sev = (s: 'critical' | 'warning' | 'info') => flags.filter((f) => f.severity === s).length;
  const travelers = useMemo(() => {
    const byId = new Map((athletes.data ?? []).map((a) => [a.id, a]));
    return trip.traveling_player_ids.map((pid) => {
      const a = byId.get(pid);
      return { id: pid, name: a ? `${a.first_name} ${a.last_name} #${a.jersey}` : pid };
    });
  }, [athletes.data, trip.traveling_player_ids]);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg({ tone: 'danger', text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  const confirmPublish = (again: boolean) =>
    Alert.alert(again ? 'Re-publish changes?' : 'Publish to athletes?', 'Athletes on the travel roster will be notified.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: again ? 'Re-publish' : 'Publish',
        onPress: () => publish.mutate(undefined, {
          onSuccess: (d) => setMsg({ tone: 'ok', text: `Published version v${d.trip.published_version}. Athletes can see it now.` }),
        }),
      },
    ]);

  const changes = hasUnpublishedChanges(trip);
  const actionError = approve.error ?? publish.error;

  return (
    <View style={{ gap: 12 }}>
      <Card>
        <Section title="Plan summary">
          {pkg ? (
            <>
              <Text style={{ fontSize: font.lg, fontWeight: '800', color: colors.text }}>{pkg.label} · {pkg.option_id}</Text>
              <Caption>{pkg.hotel_name}</Caption>
              <Money value={pkg.costs.total} size="lg" label="Total" />
              <Row>
                {sev('critical') > 0 && <Chip label={`${sev('critical')} critical`} tone="danger" />}
                {sev('warning') > 0 && <Chip label={`${sev('warning')} warning${sev('warning') > 1 ? 's' : ''}`} tone="warn" />}
                {sev('info') > 0 && <Chip label={`${sev('info')} info`} tone="info" />}
                {flags.length === 0 && <Chip label="No risk flags" tone="ok" />}
              </Row>
            </>
          ) : (
            <Banner tone="warn" message="No package selected yet." />
          )}
          <Row>
            <Chip label={trip.rooming ? `Rooming ✓ (${trip.rooming.requests_honored}/${trip.rooming.requests_total} requests)` : 'Rooming not generated'} tone={trip.rooming ? 'ok' : 'warn'} />
            <Chip label={trip.memo ? 'Memo ✓' : 'No memo'} tone={trip.memo ? 'ok' : 'neutral'} />
          </Row>
          {!trip.rooming && <Button title="Generate rooming first" variant="ghost" onPress={() => goTo('rooming')} />}
        </Section>
      </Card>

      {msg && <Banner tone={msg.tone} message={msg.text} onDismiss={() => setMsg(null)} />}
      {actionError && <Banner tone="danger" message={errorMessage(actionError)} />}

      <Card>
        <Section title="Approval">
          {trip.status === 'draft' && (
            <>
              <Caption>Approving commits this package to the season budget.</Caption>
              <Button
                title="Approve plan"
                onPress={() => approve.mutate(undefined, { onSuccess: () => setMsg({ tone: 'ok', text: 'Approved. Next: publish to athletes.' }) })}
                loading={approve.isPending}
                disabled={!trip.selected_option_id}
                accessibilityHint={trip.selected_option_id ? undefined : 'Select a package first'}
              />
            </>
          )}
          {trip.status === 'approved' && (
            <>
              <Chip label="Approved" tone="info" />
              <Button title="Publish to athletes" onPress={() => confirmPublish(false)} loading={publish.isPending} />
            </>
          )}
          {trip.status === 'published' && (
            <>
              <Chip label={`Version v${trip.published_version} published ${when(trip.published_at)}`} tone="ok" />
              <Button
                title="Re-publish changes"
                onPress={() => confirmPublish(true)}
                loading={publish.isPending}
                disabled={!changes}
                accessibilityHint={changes ? 'Creates a new version and notifies athletes of what changed' : 'No changes since the last publish'}
              />
              {!changes && <Caption>No changes since the last publish.</Caption>}
            </>
          )}
          {trip.status === 'completed' && <Chip label={`Completed · v${trip.published_version}`} tone="neutral" />}
          {trip.status === 'not_started' && <Caption>Submit a request and select a package first.</Caption>}
        </Section>
      </Card>

      <Card>
        <Section title="Packets & sharing" hint="The staff packet includes costs (estimates). Athlete packets don't.">
          <Button
            title="Staff packet (PDF)"
            variant="secondary"
            onPress={() => run('staff', () => sharePacketPdf(id, 'staff'))}
            loading={busy === 'staff'}
            disabled={!pkg}
          />
          <Button
            title={showPicker ? 'Hide athlete picker' : 'Athlete packet preview'}
            variant="ghost"
            onPress={() => setShowPicker((v) => !v)}
            disabled={!pkg}
          />
          {showPicker && (
            travelers.length ? (
              <View style={{ gap: 8 }}>
                <Caption>Pick a traveling athlete:</Caption>
                <Row>
                  {travelers.slice(0, 24).map((t) => (
                    <SelectChip key={t.id} label={t.name} selected={previewAthlete === t.id} onPress={() => setPreviewAthlete(t.id)} />
                  ))}
                </Row>
                {travelers.length > 24 && <Caption>Showing 24 of {travelers.length} travelers.</Caption>}
                <Button
                  title="Open athlete packet (PDF)"
                  onPress={() => previewAthlete && run('athlete', () => sharePacketPdf(id, 'athlete', previewAthlete))}
                  loading={busy === 'athlete'}
                  disabled={!previewAthlete}
                />
              </View>
            ) : (
              <Caption>The travel roster is built when the trip is published. Publish first to preview an athlete's packet.</Caption>
            )
          )}
          <Button
            title="Share read-only link"
            variant="ghost"
            onPress={() => run('link', async () => {
              const ok = await shareReadOnlyLink(id, game.opponent);
              if (!ok) setMsg({ tone: 'info', text: 'Publish the trip first — the read-only link is created on publish.' });
            })}
            loading={busy === 'link'}
          />
        </Section>
      </Card>
      {(trip.status === 'published' || trip.status === 'completed') && (
        <Button title="Next: Actuals (after the trip)" variant="ghost" onPress={() => goTo('actuals')} />
      )}
    </View>
  );
}

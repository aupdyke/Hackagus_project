/** Step 5 Rooming (B-10): code assigns rooms; staff review, search and swap before publishing. */
import { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import type { Room, Rooming } from '@falcon/shared';
import { Banner, Button, Caption, Card, Chip, Empty, ErrorState, Field, Loading, Row } from '../../ui';
import { errorMessage } from '../../../lib/api';
import { useAthletes, useGenerateRooming, useRooming, useUpdateRooming } from '../../../lib/staff/queries';
import { RoomRow } from '../RoomRow';
import { Section } from '../Section';
import type { StepProps } from './types';

const KINDS: { kind: Room['kind']; title: string }[] = [
  { kind: 'player', title: 'Player rooms' },
  { kind: 'coach', title: 'Coach rooms' },
  { kind: 'support', title: 'Support rooms' },
  { kind: 'driver', title: 'Driver rooms' },
];

export function RoomingStep({ detail, goTo }: StepProps) {
  const { trip } = detail;
  const id = trip.trip_id;
  const q = useRooming(id);
  const athletes = useAthletes();
  const generate = useGenerateRooming(id);
  const update = useUpdateRooming(id);
  const [edit, setEdit] = useState<Room[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [savedAfterPublish, setSavedAfterPublish] = useState(false);

  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of athletes.data ?? []) m.set(a.id, `${a.first_name} ${a.last_name} #${a.jersey}`);
    return m;
  }, [athletes.data]);
  const nameOf = (pid: string) =>
    names.get(pid) ?? (pid.startsWith('S-') ? `Staff ${pid}` : pid.toUpperCase().startsWith('DRIVER') ? 'Bus driver' : pid);

  const rooming: Rooming | null = q.data !== undefined ? q.data : trip.rooming;
  const rooms = edit ?? rooming?.rooms ?? [];

  const hits = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (s.length < 2) return null;
    const set = new Set<string>();
    for (const r of rooms) for (const pid of r.occupant_ids) if (nameOf(pid).toLowerCase().includes(s) || pid.toLowerCase().includes(s)) set.add(pid);
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, rooms, names]);

  if (q.isLoading && !trip.rooming) return <Loading label="Loading rooming…" />;
  if (q.isError && !trip.rooming) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const locked = trip.status === 'completed';
  const doGenerate = () => generate.mutate(undefined, { onSuccess: () => { setEdit(null); setPicked(null); } });

  if (!rooming) {
    return (
      <View style={{ gap: 12 }}>
        <Empty title="No rooming list yet" hint="Code assigns rooms from the travel roster, honoring mutual roommate requests first." />
        {generate.isError && <Banner tone="danger" message={errorMessage(generate.error)} />}
        {!locked && <Button title="Generate rooming list" onPress={doGenerate} loading={generate.isPending} />}
      </View>
    );
  }

  const tapPerson = (pid: string) => {
    if (!edit) return;
    if (!picked) return setPicked(pid);
    if (picked === pid) return setPicked(null);
    const roomA = edit.findIndex((r) => r.occupant_ids.includes(picked));
    const roomB = edit.findIndex((r) => r.occupant_ids.includes(pid));
    if (roomA === roomB) return setPicked(pid); // same room: just move the selection
    setEdit(edit.map((r, i) => {
      if (i === roomA) return { ...r, occupant_ids: r.occupant_ids.map((x) => (x === picked ? pid : x)) };
      if (i === roomB) return { ...r, occupant_ids: r.occupant_ids.map((x) => (x === pid ? picked : x)) };
      return r;
    }));
    setPicked(null);
  };

  const changed = !!edit && JSON.stringify(edit) !== JSON.stringify(rooming.rooms);
  const save = () =>
    edit && update.mutate(edit, {
      onSuccess: () => { setEdit(null); setPicked(null); if (trip.status === 'published') setSavedAfterPublish(true); },
    });
  const regenerate = () =>
    Alert.alert('Regenerate rooming?', rooming.edited || changed ? 'This discards the manual swaps.' : 'Rooms will be reassigned by code.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Regenerate', style: 'destructive', onPress: doGenerate },
    ]);

  const count = (k: Room['kind']) => rooms.filter((r) => r.kind === k).length;
  // server validation errors arrive as one message; show each part on its own line
  const saveErrors = update.isError ? errorMessage(update.error).split(/;\s*|\n/).filter(Boolean) : [];

  return (
    <View style={{ gap: 12 }}>
      <Card>
        <Row>
          <Chip label={`Roommate requests honored ${rooming.requests_honored} / ${rooming.requests_total}`} tone="info" />
          {rooming.edited && <Chip label="Edited by staff" tone="brand" />}
        </Row>
        <Caption>
          {rooms.length} rooms · {count('player')} player · {count('coach')} coach · {count('support')} support · {count('driver')} driver
        </Caption>
      </Card>

      {savedAfterPublish && (
        <View style={{ gap: 6 }}>
          <Banner tone="warn" message="Saved. Re-publish to notify athletes of room changes." onDismiss={() => setSavedAfterPublish(false)} />
          <Button title="Go to Publish" variant="ghost" onPress={() => goTo('publish')} />
        </View>
      )}

      <Field label="Find a person" value={search} onChangeText={setSearch} placeholder="Name, jersey or ID" />
      {hits && <Caption tone="info">{hits.size ? `${hits.size} match${hits.size > 1 ? 'es' : ''} highlighted` : 'No matches'}</Caption>}

      {!locked && (edit ? (
        <Banner tone="info" message={picked ? `Now tap someone in another room to swap with ${nameOf(picked)}.` : 'Swap mode: tap a person, then tap someone in another room.'} />
      ) : (
        <Row wrap={false}>
          <View style={{ flex: 1 }}><Button title="Swap people" variant="secondary" onPress={() => setEdit(rooming.rooms.map((r) => ({ ...r, occupant_ids: [...r.occupant_ids] })))} /></View>
          <View style={{ flex: 1 }}><Button title="Regenerate" variant="ghost" onPress={regenerate} loading={generate.isPending} /></View>
        </Row>
      ))}

      {saveErrors.length > 0 && (
        <Card style={{ borderColor: '#B3261E' }}>
          <Caption tone="danger">Could not save these rooms:</Caption>
          {saveErrors.map((e, i) => <Caption key={i} tone="danger">• {e}</Caption>)}
        </Card>
      )}
      {generate.isError && <Banner tone="danger" message={errorMessage(generate.error)} />}

      {KINDS.map(({ kind, title }) => {
        const list = rooms.filter((r) => r.kind === kind && (!hits || r.occupant_ids.some((p) => hits.has(p))));
        if (!list.length) return null;
        return (
          <Card key={kind}>
            <Section title={`${title} (${list.length})`}>
              {list.map((r) => (
                <RoomRow key={r.room_id} room={r} nameOf={nameOf} selectedId={picked} onTapPerson={tapPerson} swapMode={!!edit} highlightIds={hits ?? undefined} />
              ))}
            </Section>
          </Card>
        );
      })}

      {edit && (
        <Card>
          <Row wrap={false}>
            <View style={{ flex: 1 }}><Button title="Discard" variant="ghost" onPress={() => { setEdit(null); setPicked(null); update.reset(); }} /></View>
            <View style={{ flex: 1.6 }}><Button title="Save changes" onPress={save} disabled={!changed} loading={update.isPending} /></View>
          </Row>
        </Card>
      )}
      {!edit && <Button title="Next: Approve & Publish" variant="secondary" onPress={() => goTo('publish')} />}
    </View>
  );
}

/** Roommate requests: pick up to 2 from the trip's travel roster before the deadline; final rooming after publish. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ApiClientError, formatDayTime } from '@falcon/shared';
import { AiNotice, Body, Button, Card, Chip, Empty, ErrorState, H2, Loading } from '../../components/ui';
import { RosterPicker } from '../../components/athlete/RosterPicker';
import { api, errorMessage } from '../../lib/api';
import { formatCountdown, localDate } from '../../lib/athlete/time';
import { useSession } from '../../lib/role';
import { colors, radius, space } from '../../lib/theme';

const MAX = 2;

export default function Roommates() {
  const id = useSession().session.athleteId;
  const qc = useQueryClient();
  const myTrip = useQuery({ queryKey: ['my-trip', id], queryFn: () => api.myTrip({ params: { id: id! } }), enabled: !!id });
  const open = myTrip.data?.open_roommate_requests ?? [];
  const [tripId, setTripId] = useState<string | null>(null);
  const active = open.find((o) => o.trip_id === tripId) ?? open[0] ?? null;

  const roster = useQuery({
    queryKey: ['travel-roster', id, active?.trip_id],
    queryFn: () => api.travelRoster({ params: { id: id!, tripId: active!.trip_id } }),
    enabled: !!id && !!active,
  });
  const saved = useQuery({
    queryKey: ['roommate-request', id, active?.trip_id],
    queryFn: () => api.getRoommateRequest({ params: { id: id!, tripId: active!.trip_id } }),
    enabled: !!id && !!active,
  });

  const [picks, setPicks] = useState<string[]>([]);
  const [lockedMsg, setLockedMsg] = useState<string | null>(null);
  useEffect(() => {
    setPicks(saved.data?.requested_ids ?? []);
    setLockedMsg(null);
  }, [saved.data, active?.trip_id]);

  const save = useMutation({
    mutationFn: () => api.roommateRequest({ params: { id: id! }, body: { trip_id: active!.trip_id, requested_ids: picks } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roommate-request', id, active?.trip_id] }),
    onError: (e) => {
      if (e instanceof ApiClientError && e.code === 'conflict') setLockedMsg(e.message);
    },
  });

  if (myTrip.isLoading) return <Loading />;
  if (myTrip.isError) return <View style={{ padding: space.lg }}><ErrorState error={myTrip.error} onRetry={() => myTrip.refetch()} /></View>;

  const published = myTrip.data!.trip;
  const nameOf = (rid: string) => roster.data?.find((r) => r.id === rid)?.name ?? rid;

  // nothing open → show final rooming (if published) or an empty state
  if (!active) {
    return (
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.lg, gap: space.md }}>
        {published ? (
          <Card>
            <H2>Final rooming · at {published.game.opponent}</H2>
            <Text style={s.big}>{published.room_id ?? 'Room TBD'}</Text>
            <Body>{published.roommates.length ? `with ${published.roommates.map((r) => r.name).join(' & ')}` : 'Roommate not assigned yet'}</Body>
            <Body muted>Rooming is final for this trip. Questions? Ask a coach.</Body>
          </Card>
        ) : (
          <Empty title="No trips open for roommate requests" hint="When staff open requests for a trip you're traveling on, you can pick up to 2 roommates here." />
        )}
      </ScrollView>
    );
  }

  const deadlinePassed = localDate(active.deadline_local).getTime() < Date.now();
  const locked = deadlinePassed || !!lockedMsg;
  const dirty = JSON.stringify([...picks].sort()) !== JSON.stringify([...(saved.data?.requested_ids ?? [])].sort());

  function toggle(rid: string) {
    if (picks.includes(rid)) setPicks(picks.filter((x) => x !== rid));
    else if (picks.length >= MAX) Alert.alert(`You can pick up to ${MAX}`, 'Remove someone first.');
    else setPicks([...picks, rid]);
  }

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.lg, gap: space.md }} keyboardShouldPersistTaps="handled">
      {open.length > 1 && (
        <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
          {open.map((o) => (
            <Pressable key={o.trip_id} accessibilityRole="button" accessibilityState={{ selected: o.trip_id === active.trip_id }} onPress={() => setTripId(o.trip_id)} style={[s.seg, o.trip_id === active.trip_id && s.segOn]}>
              <Text style={{ fontWeight: '700', color: o.trip_id === active.trip_id ? '#fff' : colors.brown }}>at {o.opponent}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <Card>
        <H2>Roommates · at {active.opponent}</H2>
        <Body>{locked ? 'Requests are closed.' : `Pick up to ${MAX} by ${formatDayTime(active.deadline_local)}`}</Body>
        {!locked && <Chip label={`Closes in ${formatCountdown(localDate(active.deadline_local).getTime() - Date.now())}`} tone="brand" />}
        <Body muted>Mutual requests are matched first. Staff make the final call.</Body>
        <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
          {picks.length === 0 && <Body muted>No one picked yet.</Body>}
          {picks.map((p) => (
            <Pressable key={p} disabled={locked} accessibilityRole="button" accessibilityLabel={`Remove ${nameOf(p)}`} onPress={() => toggle(p)} style={s.pick}>
              <Text style={{ color: colors.brown, fontWeight: '700' }}>{nameOf(p)}{locked ? '' : '  ✕'}</Text>
            </Pressable>
          ))}
        </View>
        {lockedMsg && <AiNotice message={lockedMsg} />}
        {save.isError && !lockedMsg && <AiNotice message={errorMessage(save.error)} />}
        {!locked && (
          <Button
            title={save.isSuccess && !dirty ? 'Saved ✓' : 'Save my picks'}
            loading={save.isPending}
            disabled={!dirty}
            onPress={() => save.mutate()}
          />
        )}
      </Card>
      {roster.isLoading && <Loading label="Loading travel roster…" />}
      {roster.isError && <ErrorState error={roster.error} onRetry={() => roster.refetch()} />}
      {roster.data && !locked && <RosterPicker roster={roster.data} selected={picks} onToggle={toggle} max={MAX} />}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  big: { fontSize: 32, fontWeight: '900', color: colors.brown },
  seg: { minHeight: 40, paddingHorizontal: space.md, justifyContent: 'center', borderRadius: 999, borderWidth: 2, borderColor: colors.brown },
  segOn: { backgroundColor: colors.brown },
  pick: { minHeight: 40, paddingHorizontal: space.md, justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.orangeSoft, borderWidth: 1, borderColor: colors.orange },
});

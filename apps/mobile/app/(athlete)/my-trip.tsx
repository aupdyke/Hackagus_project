/** My Trip: countdown, bus / room / hotel, personal itinerary timeline, packing list, share packet. */
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatClock, formatDate, formatDayTime } from '@falcon/shared';
import { AiNotice, Body, Button, Card, Empty, ErrorState, H2, Loading } from '../../components/ui';
import { Countdown } from '../../components/athlete/Countdown';
import { InfoCard } from '../../components/athlete/InfoCard';
import { Timeline } from '../../components/athlete/Timeline';
import { api } from '../../lib/api';
import { shareAthletePacket, shareTripLink } from '../../lib/athlete/packet';
import { useSession } from '../../lib/role';
import { colors, font, radius, space } from '../../lib/theme';

export default function MyTrip() {
  const { session } = useSession();
  const id = session.athleteId;
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const q = useQuery({
    queryKey: ['my-trip', id],
    queryFn: () => api.myTrip({ params: { id: id! } }),
    enabled: !!id,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const timelineY = useRef(0);
  const itemY = useRef<Record<string, number>>({});
  const [packed, setPacked] = useState<Record<string, boolean>>({});
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  // scroll to a cited itinerary item (from Assistant / Inbox)
  useEffect(() => {
    if (!focus) return;
    const t = setTimeout(() => {
      const y = itemY.current[focus];
      if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, timelineY.current + y - 120), animated: true });
    }, 350);
    return () => clearTimeout(t);
  }, [focus, q.data]);

  if (!id) {
    return (
      <View style={{ flex: 1, padding: space.lg, backgroundColor: colors.bg }}>
        <Button title="Pick your name" onPress={() => router.replace('/')} />
      </View>
    );
  }
  if (q.isLoading) return <Loading label="Loading your trip…" />;
  if (q.isError) return <View style={{ padding: space.lg }}><ErrorState error={q.error} onRetry={() => q.refetch()} /></View>;

  const { athlete, trip, open_roommate_requests: open } = q.data!;
  const roommateBanner = open.length > 0 && (
    <Pressable accessibilityRole="button" accessibilityLabel={`Pick your roommates for ${open[0]!.opponent} by ${formatDayTime(open[0]!.deadline_local)}`} onPress={() => router.push('/(athlete)/roommates')}>
      <AiNotice message={`Pick your roommates for at ${open[0]!.opponent} by ${formatDayTime(open[0]!.deadline_local)} →`} />
    </Pressable>
  );

  if (!trip) {
    return (
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.lg, gap: space.md }} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
        <H2>Hi {athlete.name.split(' ')[0]}</H2>
        {roommateBanner}
        <Empty title="No published trip yet" hint="Your itinerary, bus and room show up here as soon as staff publish the trip." />
      </ScrollView>
    );
  }

  const returnAt = trip.itinerary[trip.itinerary.length - 1]?.start_local;
  const roommateNames = trip.roommates.map((r) => r.name).join(' & ');

  async function onSharePdf() {
    setShareError(null);
    setSharing(true);
    try {
      await shareAthletePacket(trip!.trip_id, id!);
    } catch (e) {
      setShareError((e as Error).message);
    } finally {
      setSharing(false);
    }
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
    >
      <View style={s.hero}>
        <Text style={s.kicker}>HI {athlete.name.split(' ')[0]!.toUpperCase()} · #{athlete.jersey}</Text>
        <Text style={s.title} accessibilityRole="header">BGSU at {trip.game.opponent}</Text>
        <Text style={s.sub}>{formatDate(trip.game.date)} · kickoff {formatClock(trip.game.kickoff_local)} · {trip.game.stadium_name}</Text>
        <View style={{ marginTop: space.md }}>
          <Countdown departure={trip.departure_local} returnAt={returnAt} />
          <Text style={s.sub}>Departs {formatDayTime(trip.departure_local)}</Text>
        </View>
      </View>

      <View style={{ padding: space.lg, gap: space.md }}>
        {roommateBanner}
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <InfoCard icon="bus" title="Your bus" value={trip.bus_number != null ? `Bus ${trip.bus_number}` : 'TBD'} />
          <InfoCard icon="bed" title="Your room" value={trip.room_id ?? 'TBD'} detail={roommateNames ? `with ${roommateNames}` : 'Roommate TBD'} />
        </View>
        <InfoCard
          icon="business"
          title="Hotel"
          value={trip.hotel.name}
          detail={`${trip.hotel.address}\n${trip.hotel.phone}`}
          accessibilityHint="Calls the hotel"
          onPress={() => Linking.openURL(`tel:${trip.hotel.phone.replace(/[^\d+]/g, '')}`)}
        />

        <Card>
          <View onLayout={(e) => (timelineY.current = e.nativeEvent.layout.y + 16)}>
            <H2>Itinerary</H2>
            <Timeline items={trip.itinerary} focusId={focus} onItemLayout={(itemId, y) => (itemY.current[itemId] = y + 40)} />
          </View>
        </Card>

        <Card>
          <H2>What to bring</H2>
          {trip.packing_list.map((p) => (
            <Pressable
              key={p}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: !!packed[p] }}
              accessibilityLabel={p}
              onPress={() => setPacked((x) => ({ ...x, [p]: !x[p] }))}
              style={s.check}
            >
              <View style={[s.box, packed[p] && { backgroundColor: colors.orange, borderColor: colors.orange }]}>
                {packed[p] && <Text style={{ color: '#fff', fontWeight: '900' }}>✓</Text>}
              </View>
              <Text style={[s.checkText, packed[p] && { color: colors.muted, textDecorationLine: 'line-through' }]}>{p}</Text>
            </Pressable>
          ))}
        </Card>

        <Card>
          <H2>Share</H2>
          <Button title="Share my itinerary (PDF)" loading={sharing} onPress={onSharePdf} />
          <Button
            title="Share read-only link"
            variant="ghost"
            onPress={() => shareTripLink(trip.share_url, trip.game.opponent).catch((e: Error) => setShareError(e.message))}
          />
          {shareError && <Body muted>{shareError}</Body>}
        </Card>
        <Text style={s.caption}>Version {trip.version} · published {new Date(trip.published_at).toLocaleString()}</Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  hero: { backgroundColor: colors.brown, padding: space.lg, paddingBottom: space.xl, borderBottomWidth: 6, borderBottomColor: colors.orange },
  kicker: { color: colors.orangeSoft, fontWeight: '800', letterSpacing: 1.2, fontSize: font.sm },
  title: { color: '#fff', fontSize: font.xxl, fontWeight: '900', marginTop: 2 },
  sub: { color: '#F3E9E4', fontSize: font.md, marginTop: 2 },
  check: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 },
  box: { width: 26, height: 26, borderRadius: radius.sm, borderWidth: 2, borderColor: colors.brown, alignItems: 'center', justifyContent: 'center' },
  checkText: { fontSize: font.md, color: colors.text, flex: 1 },
  caption: { fontSize: font.sm, color: colors.muted, textAlign: 'center' },
});

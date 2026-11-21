/** Inbox: per-athlete change notifications (code-generated diffs), before → after. Marks items read when viewed. */
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Empty, ErrorState, Loading } from '../../components/ui';
import { ChangeRow } from '../../components/athlete/ChangeRow';
import { timeAgo } from '../../lib/athlete/time';
import { useMarkRead, useNotificationsQuery } from '../../lib/notifications';
import { useSession } from '../../lib/role';
import { colors, font, radius, space } from '../../lib/theme';

export default function Inbox() {
  const id = useSession().session.athleteId;
  const q = useNotificationsQuery(id);
  const markRead = useMarkRead(id);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const dataRef = useRef(q.data);
  dataRef.current = q.data;

  // when the inbox is viewed, mark what's on screen as read (after a short pause so the unread state is visible)
  useFocusEffect(
    useCallback(() => {
      const t = setTimeout(() => {
        const unread = (dataRef.current ?? []).filter((n) => !n.read).map((n) => n.id);
        markRead(unread).catch(() => {});
      }, 2500);
      return () => clearTimeout(t);
    }, [markRead]),
  );

  if (q.isLoading) return <Loading label="Loading updates…" />;
  if (q.isError) return <View style={{ padding: space.lg }}><ErrorState error={q.error} onRetry={() => q.refetch()} /></View>;

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: space.lg, gap: space.md, flexGrow: 1 }}
      data={q.data ?? []}
      keyExtractor={(n) => n.id}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
      ListEmptyComponent={<Empty title="No updates yet" hint="When staff change your trip, you'll see exactly what changed here." />}
      renderItem={({ item: n }) => {
        const open = !collapsed[n.id];
        return (
          <View style={[s.card, !n.read && s.unread]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${n.read ? '' : 'Unread. '}${n.title}. ${timeAgo(n.created_at)}`}
              accessibilityState={{ expanded: open }}
              onPress={() => setCollapsed((c) => ({ ...c, [n.id]: open }))}
              style={{ gap: 4 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                {!n.read && <View style={s.dot} />}
                <Text style={s.title}>{n.title}</Text>
              </View>
              <Text style={s.meta}>{timeAgo(n.created_at)} · version {n.version}</Text>
              <Text style={s.body}>{n.body}</Text>
            </Pressable>
            {open && n.changes.map((c, i) => <ChangeRow key={`${c.item_id}-${i}`} change={c} />)}
          </View>
        );
      }}
    />
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg, gap: space.sm, borderWidth: 1, borderColor: colors.border },
  unread: { borderLeftWidth: 6, borderLeftColor: colors.orange },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.orange },
  title: { flex: 1, fontSize: font.lg, fontWeight: '800', color: colors.brown },
  meta: { fontSize: font.sm, color: colors.muted },
  body: { fontSize: font.md, color: colors.text, lineHeight: 22 },
});

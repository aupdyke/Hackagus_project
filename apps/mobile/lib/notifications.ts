/**
 * Athlete change notifications: one polled query (45 s + on app foreground via focusManager), unread count for the
 * tab badge, and LOCAL notifications for newly arrived items (expo-notifications). No remote APNs push.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useRef } from 'react';
import { api } from './api';

let handlerSet = false;
function ensureHandler() {
  if (handlerSet) return;
  handlerSet = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
    });
  } catch {
    /* not available (e.g. web) */
  }
}

export const notificationsKey = (athleteId: string | null) => ['notifications', athleteId] as const;

export function useNotificationsQuery(athleteId: string | null) {
  return useQuery({
    queryKey: notificationsKey(athleteId),
    queryFn: () => api.notifications({ params: { id: athleteId! } }),
    enabled: !!athleteId,
    refetchInterval: 45_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function useUnreadCount(athleteId: string | null): number {
  const q = useNotificationsQuery(athleteId);
  return (q.data ?? []).filter((n) => !n.read).length;
}

export function useMarkRead(athleteId: string | null) {
  const qc = useQueryClient();
  return useCallback(
    async (ids: string[]) => {
      if (!athleteId || !ids.length) return;
      await api.markNotificationsRead({ params: { id: athleteId }, body: { ids } });
      await qc.invalidateQueries({ queryKey: notificationsKey(athleteId) });
    },
    [athleteId, qc],
  );
}

/**
 * Fire a local notification for each unread item that arrives after the first fetch.
 * Permission is requested once; if denied, the in-app badge still works.
 */
export function useLocalNotify(athleteId: string | null) {
  const q = useNotificationsQuery(athleteId);
  const seen = useRef<Set<string> | null>(null);
  const permission = useRef<'unknown' | 'granted' | 'denied'>('unknown');

  useEffect(() => {
    seen.current = null; // new athlete → re-baseline
  }, [athleteId]);

  useEffect(() => {
    if (!athleteId) return;
    ensureHandler();
    (async () => {
      try {
        const cur = await Notifications.getPermissionsAsync();
        if (cur.granted) permission.current = 'granted';
        else if (cur.canAskAgain) permission.current = (await Notifications.requestPermissionsAsync()).granted ? 'granted' : 'denied';
        else permission.current = 'denied';
      } catch {
        permission.current = 'denied';
      }
    })();
  }, [athleteId]);

  useEffect(() => {
    const items = q.data;
    if (!items) return;
    if (!seen.current) {
      seen.current = new Set(items.map((n) => n.id));
      return;
    }
    const fresh = items.filter((n) => !n.read && !seen.current!.has(n.id));
    for (const n of fresh) {
      seen.current.add(n.id);
      if (permission.current !== 'granted') continue;
      Notifications.scheduleNotificationAsync({ content: { title: n.title, body: n.body }, trigger: null }).catch(() => {});
    }
  }, [q.data]);
}

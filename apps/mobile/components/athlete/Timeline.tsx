/** Vertical itinerary grouped by day. Reports each item's y offset so the screen can scroll to a cited item. */
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatClock, formatDate, type ItineraryItem } from '@falcon/shared';
import { localDate } from '../../lib/athlete/time';
import { colors, font, radius, space } from '../../lib/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];
const ICON: Partial<Record<ItineraryItem['kind'], IconName>> = {
  depart: 'bus', depart_hotel: 'bus', depart_return: 'bus', stop: 'cafe', meal: 'restaurant', arrive_hotel: 'bed',
  checkin: 'key', walkthrough: 'walk', meeting: 'people', curfew: 'moon', arrive_stadium: 'flag', kickoff: 'american-football',
  arrive_home: 'home',
};

export function Timeline({ items, focusId, onItemLayout }: {
  items: ItineraryItem[];
  focusId?: string;
  onItemLayout?: (id: string, y: number) => void;
}) {
  const now = Date.now();
  const nextId = items.find((i) => localDate(i.start_local).getTime() > now)?.id;
  const days: { date: string; items: ItineraryItem[] }[] = [];
  for (const it of items) {
    const d = it.start_local.slice(0, 10);
    const last = days[days.length - 1];
    if (last && last.date === d) last.items.push(it);
    else days.push({ date: d, items: [it] });
  }
  return (
    <View>
      {days.map((day) => (
        <View key={day.date} style={{ marginBottom: space.md }}>
          <Text style={s.day} accessibilityRole="header">{formatDate(day.date)}</Text>
          {day.items.map((it, idx) => {
            const focused = it.id === focusId;
            const next = it.id === nextId;
            const last = idx === day.items.length - 1;
            return (
              <View
                key={it.id}
                nativeID={it.id}
                onLayout={(e) => onItemLayout?.(it.id, e.nativeEvent.layout.y)}
                style={[s.row, focused && s.focused]}
                accessible
                accessibilityLabel={`${formatClock(it.start_local)}${it.end_local ? ` to ${formatClock(it.end_local)}` : ''}, ${it.label}${it.location ? `, at ${it.location}` : ''}${next ? ', next up' : ''}`}
              >
                <Text style={[s.time, next && { color: colors.orange }]}>{formatClock(it.start_local)}</Text>
                <View style={s.rail}>
                  <View style={[s.dot, (next || focused) && { backgroundColor: colors.orange, borderColor: colors.orange }]}>
                    <Ionicons name={ICON[it.kind] ?? 'ellipse'} size={14} color={next || focused ? '#fff' : colors.brown} />
                  </View>
                  {!last && <View style={s.line} />}
                </View>
                <View style={{ flex: 1, paddingBottom: space.md }}>
                  <Text style={s.label}>{it.label}{next ? '  · Next' : ''}</Text>
                  {!!it.location && <Text style={s.loc}>{it.location}</Text>}
                  {!!it.end_local && <Text style={s.loc}>until {formatClock(it.end_local)}</Text>}
                </View>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  day: { fontSize: font.lg, fontWeight: '800', color: colors.brown, marginBottom: space.sm },
  row: { flexDirection: 'row', gap: space.sm, borderRadius: radius.md, paddingHorizontal: 4, paddingTop: 2 },
  focused: { backgroundColor: colors.orangeSoft },
  time: { width: 76, fontSize: font.md, fontWeight: '700', color: colors.text, paddingTop: 4 },
  rail: { alignItems: 'center', width: 28 },
  dot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.brown, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  line: { flex: 1, width: 2, backgroundColor: colors.border, marginTop: 2 },
  label: { fontSize: font.md, fontWeight: '700', color: colors.text, paddingTop: 4 },
  loc: { fontSize: font.sm, color: colors.muted },
});

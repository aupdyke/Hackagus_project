/** One room with tappable occupants for swap mode (B-10). */
import { Pressable, Text, View } from 'react-native';
import type { Room } from '@falcon/shared';
import { colors, font, radius, TAP } from '../../lib/theme';

export function RoomRow({ room, nameOf, selectedId, onTapPerson, swapMode, highlightIds }: {
  room: Room;
  nameOf: (id: string) => string;
  selectedId: string | null;
  onTapPerson: (personId: string) => void;
  swapMode: boolean;
  /** ids matching the search box */
  highlightIds?: Set<string>;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Text style={{ width: 64, fontWeight: '800', color: colors.brown, fontSize: font.md, paddingTop: 12 }}>{room.room_id}</Text>
      <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {room.occupant_ids.length === 0 && <Text style={{ color: colors.muted, paddingTop: 12 }}>Empty</Text>}
        {room.occupant_ids.map((pid) => {
          const sel = selectedId === pid;
          const hit = highlightIds?.has(pid);
          const name = nameOf(pid);
          return (
            <Pressable
              key={pid}
              disabled={!swapMode}
              accessibilityRole={swapMode ? 'button' : 'text'}
              accessibilityLabel={`${name}, room ${room.room_id}${sel ? ', selected for swap' : ''}`}
              accessibilityHint={swapMode ? (sel ? 'Tap again to cancel' : 'Tap, then tap someone in another room to swap') : undefined}
              accessibilityState={{ selected: sel }}
              onPress={() => onTapPerson(pid)}
              style={({ pressed }) => ({
                minHeight: swapMode ? TAP : 40,
                justifyContent: 'center',
                paddingHorizontal: 12,
                borderRadius: radius.md,
                borderWidth: sel ? 2 : 1,
                borderColor: sel ? colors.orange : hit ? colors.info : colors.border,
                backgroundColor: sel ? colors.orangeSoft : hit ? '#E3EDF7' : colors.card,
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <Text style={{ fontSize: font.md, color: colors.text, fontWeight: sel || hit ? '700' : '400' }}>{name}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

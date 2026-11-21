/** Searchable travel roster with up to `max` selections, grouped by position group. */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, font, radius, space, TAP } from '../../lib/theme';

export type RosterItem = { id: string; name: string; position_group: string; class_year: string };
const ORDER = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'ST'];

export function RosterPicker({ roster, selected, onToggle, max, disabled }: {
  roster: RosterItem[]; selected: string[]; onToggle: (id: string) => void; max: number; disabled?: boolean;
}) {
  const [search, setSearch] = useState('');
  const groups = useMemo(() => {
    const s = search.trim().toLowerCase();
    const filtered = roster.filter((r) => !s || r.name.toLowerCase().includes(s));
    return ORDER.map((g) => ({ g, items: filtered.filter((r) => r.position_group === g).sort((a, b) => a.name.localeCompare(b.name)) })).filter((x) => x.items.length);
  }, [roster, search]);
  const full = selected.length >= max;

  return (
    <View style={{ gap: space.sm }}>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search teammates"
        placeholderTextColor={colors.muted}
        accessibilityLabel="Search teammates on this trip"
        style={s.search}
        editable={!disabled}
      />
      {groups.map(({ g, items }) => (
        <View key={g} style={{ gap: 2 }}>
          <Text style={s.group} accessibilityRole="header">{g}</Text>
          {items.map((r) => {
            const on = selected.includes(r.id);
            const blocked = disabled || (!on && full);
            return (
              <Pressable
                key={r.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on, disabled: blocked }}
                accessibilityLabel={`${r.name}, ${r.position_group}, ${r.class_year}`}
                accessibilityHint={!on && full ? `You can pick up to ${max}` : undefined}
                onPress={() => onToggle(r.id)}
                disabled={disabled}
                style={[s.row, on && { backgroundColor: colors.orangeSoft }, blocked && !on && { opacity: 0.5 }]}
              >
                <View style={[s.box, on && { backgroundColor: colors.orange, borderColor: colors.orange }]}>
                  {on && <Text style={{ color: '#fff', fontWeight: '900' }}>✓</Text>}
                </View>
                <Text style={s.name}>{r.name}</Text>
                <Text style={s.meta}>{r.class_year}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  search: { minHeight: TAP, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space.md, fontSize: font.md, backgroundColor: '#fff', color: colors.text },
  group: { fontSize: font.sm, fontWeight: '800', color: colors.muted, marginTop: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: TAP, paddingHorizontal: space.sm, borderRadius: radius.sm },
  box: { width: 26, height: 26, borderRadius: radius.sm, borderWidth: 2, borderColor: colors.brown, alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1, fontSize: font.md, color: colors.text, fontWeight: '600' },
  meta: { fontSize: font.sm, color: colors.muted },
});

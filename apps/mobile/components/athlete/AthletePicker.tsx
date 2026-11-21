/** Searchable roster list for the role switch (no login). */
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Empty, ErrorState, Loading } from '../ui';
import { api } from '../../lib/api';
import { colors, font, radius, space, TAP } from '../../lib/theme';

const GROUPS = ['All', 'QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'ST'] as const;
export type PickedAthlete = { id: string; name: string };

export function AthletePicker({ onPick }: { onPick: (a: PickedAthlete) => void }) {
  const q = useQuery({ queryKey: ['athletes'], queryFn: () => api.listAthletes() });
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState<(typeof GROUPS)[number]>('All');

  const list = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data ?? [])
      .filter((a) => group === 'All' || a.position_group === group)
      .filter((a) => !s || `${a.first_name} ${a.last_name}`.toLowerCase().includes(s) || String(a.jersey) === s)
      .sort((a, b) => a.last_name.localeCompare(b.last_name));
  }, [q.data, search, group]);

  if (q.isLoading) return <Loading label="Loading roster…" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  return (
    <View style={{ flex: 1, gap: space.sm }}>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search name or jersey #"
        placeholderTextColor={colors.muted}
        accessibilityLabel="Search players by name or jersey number"
        autoCorrect={false}
        style={s.search}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: space.sm, paddingVertical: 2, alignItems: 'center' }}>
        {GROUPS.map((g) => (
          <Pressable
            key={g}
            accessibilityRole="button"
            accessibilityState={{ selected: g === group }}
            accessibilityLabel={g === 'All' ? 'All positions' : `${g} position group`}
            onPress={() => setGroup(g)}
            style={[s.filter, g === group && s.filterOn]}
          >
            <Text style={[s.filterText, g === group && { color: '#fff' }]}>{g}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <FlatList
        data={list}
        keyExtractor={(a) => a.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Empty title="No players match" hint="Try another name or position." />}
        renderItem={({ item: a }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${a.first_name} ${a.last_name}, number ${a.jersey}, ${a.position}, ${a.class_year}`}
            onPress={() => onPick({ id: a.id, name: `${a.first_name} ${a.last_name}` })}
            style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.orangeSoft }]}
          >
            <View style={s.jersey}>
              <Text style={s.jerseyText}>{a.jersey}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{a.first_name} {a.last_name}</Text>
              <Text style={s.meta}>{a.position} · {a.position_group} · {a.class_year}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  search: { minHeight: TAP, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space.md, fontSize: font.lg, backgroundColor: '#fff', color: colors.text },
  filter: { height: 44, minWidth: 48, paddingHorizontal: space.md, borderRadius: 999, borderWidth: 1, borderColor: colors.brown, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  filterOn: { backgroundColor: colors.brown },
  filterText: { color: colors.brown, fontWeight: '700', fontSize: font.sm },
  row: { minHeight: TAP + 12, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, paddingHorizontal: space.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
  jersey: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center' },
  jerseyText: { color: '#fff', fontWeight: '800', fontSize: font.lg },
  name: { fontSize: font.lg, fontWeight: '700', color: colors.text },
  meta: { fontSize: font.sm, color: colors.muted },
});

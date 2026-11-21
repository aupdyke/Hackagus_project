/** Launch: role switch (Staff / Student-athlete + synthetic player picker). Demo only — no real auth. */
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/ui';
import { AthletePicker } from '../components/athlete/AthletePicker';
import { api, errorMessage } from '../lib/api';
import { API_URL } from '../lib/config';
import { useSession } from '../lib/role';
import { colors, font, radius, space } from '../lib/theme';

function ServerPill() {
  const health = useQuery({ queryKey: ['health'], queryFn: () => api.health(), retry: 0 });
  const ok = health.isSuccess;
  const label = health.isLoading
    ? 'Connecting…'
    : ok
      ? `Server OK · AI ${health.data.ai_mode === 'live' ? 'live' : health.data.ai_mode === 'mock' ? 'mock' : 'off'}`
      : 'Server unreachable';
  return (
    <View style={{ gap: 4 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}. Tap to retry.`}
        onPress={() => health.refetch()}
        style={[s.pill, { backgroundColor: ok ? '#E3F4EA' : health.isLoading ? colors.brownSoft : '#FCE4E2' }]}
      >
        <View style={[s.dot, { backgroundColor: ok ? colors.ok : health.isLoading ? colors.muted : colors.danger }]} />
        <Text style={{ fontWeight: '700', color: colors.text }}>{label}</Text>
      </Pressable>
      {health.isError && (
        <Text style={s.small}>
          {errorMessage(health.error)} ({API_URL})
        </Text>
      )}
    </View>
  );
}

export default function RoleSelect() {
  const { setSession } = useSession();
  const [picking, setPicking] = useState(false);

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={s.hero}>
        <Text style={s.kicker}>BGSU FALCONS FOOTBALL</Text>
        <Text style={s.title}>Falcon Travel</Text>
        <Text style={s.sub}>Away-game & season travel planner</Text>
      </View>
      <View style={{ flex: 1, padding: space.lg, gap: space.md }}>
        <ServerPill />
        {!picking ? (
          <View style={{ gap: space.md, marginTop: space.sm }}>
            <Button
              title="I'm Staff"
              accessibilityHint="Opens the season budget and trip planner"
              onPress={() => {
                setSession({ role: 'staff', athleteId: null, athleteName: null });
                router.replace('/(staff)/season');
              }}
            />
            <Button title="I'm a Student-athlete" variant="secondary" accessibilityHint="Pick your name from the roster" onPress={() => setPicking(true)} />
            <View style={{ flex: 1 }} />
          </View>
        ) : (
          <View style={{ flex: 1, gap: space.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={s.h2}>Who are you?</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Back to role selection" onPress={() => setPicking(false)} style={s.back}>
                <Text style={{ color: colors.brown, fontWeight: '700', fontSize: font.md }}>Back</Text>
              </Pressable>
            </View>
            <AthletePicker
              onPick={(a) => {
                setSession({ role: 'athlete', athleteId: a.id, athleteName: a.name });
                router.replace('/(athlete)/my-trip');
              }}
            />
          </View>
        )}
        <View style={s.footer}>
          <Text style={s.small}>Synthetic data · demo role switch (no login)</Text>
          <Pressable accessibilityRole="link" accessibilityLabel="Developer streaming test" onPress={() => router.push('/dev/stream')}>
            <Text style={[s.small, { textDecorationLine: 'underline' }]}>Dev: streaming test</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  hero: { backgroundColor: colors.brown, paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.xl, borderBottomWidth: 6, borderBottomColor: colors.orange },
  kicker: { color: colors.orangeSoft, fontWeight: '800', letterSpacing: 1.5, fontSize: font.sm },
  title: { color: '#fff', fontSize: 36, fontWeight: '900', marginTop: 4 },
  sub: { color: '#F3E9E4', fontSize: font.lg, marginTop: 2 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: space.sm, alignSelf: 'flex-start', paddingHorizontal: space.md, paddingVertical: 8, borderRadius: 999, minHeight: 40 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  h2: { fontSize: font.xl, fontWeight: '800', color: colors.brown },
  back: { minHeight: 44, minWidth: 64, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 2, borderColor: colors.brown },
  footer: { alignItems: 'center', gap: 4, paddingTop: space.sm },
  small: { fontSize: font.sm, color: colors.muted, textAlign: 'center' },
});

/** Launch: role switch (Staff / Athlete + synthetic player picker). Demo only — no real auth. */
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Body, Button, Card, ErrorState, H1, H2, Loading, Screen } from '../components/ui';
import { api } from '../lib/api';
import { API_URL } from '../lib/config';
import { useSession } from '../lib/role';
import { colors, font, TAP } from '../lib/theme';

export default function RoleSelect() {
  const { setSession } = useSession();
  const [pickAthlete, setPickAthlete] = useState(false);
  const health = useQuery({ queryKey: ['health'], queryFn: () => api.health() });
  const athletes = useQuery({ queryKey: ['athletes'], queryFn: () => api.listAthletes(), enabled: pickAthlete });

  return (
    <Screen>
      <H1>Falcon Travel</H1>
      <Body muted>BGSU football away-game & season travel planner. Synthetic data only.</Body>
      {health.isError ? (
        <ErrorState error={health.error} onRetry={() => health.refetch()} />
      ) : (
        <Body muted>{health.data ? `Server OK · AI: ${health.data.ai_mode}` : `Connecting to ${API_URL}…`}</Body>
      )}

      {!pickAthlete ? (
        <View style={{ gap: 12 }}>
          <Button title="I'm Staff" onPress={() => { setSession({ role: 'staff', athleteId: null, athleteName: null }); router.replace('/(staff)/season'); }} />
          <Button title="I'm an Athlete" variant="secondary" onPress={() => setPickAthlete(true)} />
          <Button title="Dev: streaming test" variant="ghost" onPress={() => router.push('/dev/stream')} />
        </View>
      ) : (
        <Card>
          <H2>Pick a player (demo)</H2>
          <Button title="Back" variant="ghost" onPress={() => setPickAthlete(false)} />
          {athletes.isLoading && <Loading />}
          {athletes.isError && <ErrorState error={athletes.error} onRetry={() => athletes.refetch()} />}
          {athletes.data?.slice(0, 40).map((a) => (
            <Pressable
              key={a.id}
              accessibilityRole="button"
              accessibilityLabel={`${a.first_name} ${a.last_name}, number ${a.jersey}, ${a.position}`}
              onPress={() => { setSession({ role: 'athlete', athleteId: a.id, athleteName: `${a.first_name} ${a.last_name}` }); router.replace('/(athlete)/my-trip'); }}
              style={{ minHeight: TAP, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: colors.border }}
            >
              <Text style={{ fontSize: font.lg, color: colors.text }}>#{a.jersey} {a.first_name} {a.last_name} · {a.position}</Text>
            </Pressable>
          ))}
        </Card>
      )}
    </Screen>
  );
}

import { Stack } from 'expo-router';
import { colors } from '../../../lib/theme';

export default function TripsStack() {
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: colors.brown }, headerTintColor: '#fff' }}>
      <Stack.Screen name="index" options={{ title: 'Away trips' }} />
      <Stack.Screen name="[id]" options={{ title: 'Trip' }} />
    </Stack>
  );
}

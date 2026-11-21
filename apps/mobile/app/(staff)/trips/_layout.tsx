import { Stack } from 'expo-router';
import { SwitchRoleButton } from '../../../components/athlete/SwitchRoleButton';
import { colors } from '../../../lib/theme';

export default function TripsStack() {
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: colors.brown }, headerTintColor: '#fff', headerRight: () => <SwitchRoleButton /> }}>
      <Stack.Screen name="index" options={{ title: 'Away trips' }} />
      <Stack.Screen name="[id]" options={{ title: 'Trip' }} />
    </Stack>
  );
}

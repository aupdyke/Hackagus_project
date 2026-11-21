import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { useSession } from '../../lib/role';

/** Header button: back to the role switch (demo, no auth). */
export function SwitchRoleButton() {
  const { setSession } = useSession();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Switch role"
      hitSlop={10}
      onPress={() => {
        setSession({ role: null, athleteId: null, athleteName: null });
        router.replace('/');
      }}
      style={{ paddingHorizontal: 14, minHeight: 44, justifyContent: 'center' }}
    >
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Switch</Text>
    </Pressable>
  );
}

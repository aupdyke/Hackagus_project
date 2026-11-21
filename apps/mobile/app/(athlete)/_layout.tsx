import { tabIcon } from '../../components/TabIcon';
import { Tabs } from 'expo-router';
import { SwitchRoleButton } from '../../components/athlete/SwitchRoleButton';
import { colors } from '../../lib/theme';

// TODO(C-08): inbox badge (tabBarBadge) from unread notification count, polling every 45s + on foreground.
export default function AthleteTabs() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.brown },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        headerRight: () => <SwitchRoleButton />,
        tabBarActiveTintColor: colors.orange,
        tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="my-trip" options={{ title: 'My Trip', tabBarIcon: tabIcon('airplane') }} />
      <Tabs.Screen name="assistant" options={{ title: 'Assistant', tabBarIcon: tabIcon('chatbubbles') }} />
      <Tabs.Screen name="inbox" options={{ title: 'Inbox', tabBarIcon: tabIcon('notifications') }} />
      <Tabs.Screen name="roommates" options={{ title: 'Roommates', tabBarIcon: tabIcon('people') }} />
    </Tabs>
  );
}
// Carter Contribuation 
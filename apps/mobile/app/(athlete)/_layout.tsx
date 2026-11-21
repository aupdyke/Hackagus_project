import { tabIcon } from '../../components/TabIcon';
import { Tabs } from 'expo-router';
import { SwitchRoleButton } from '../../components/athlete/SwitchRoleButton';
import { useLocalNotify, useUnreadCount } from '../../lib/notifications';
import { useSession } from '../../lib/role';
import { colors } from '../../lib/theme';

/** Inbox badge = unread count (query polls every 45 s + on foreground); new items also fire a local notification. */
export default function AthleteTabs() {
  const athleteId = useSession().session.athleteId;
  const unread = useUnreadCount(athleteId);
  useLocalNotify(athleteId);
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
      <Tabs.Screen name="inbox" options={{ title: 'Inbox', tabBarIcon: tabIcon('notifications'), tabBarBadge: unread > 0 ? unread : undefined, tabBarBadgeStyle: { backgroundColor: colors.orange } }} />
      <Tabs.Screen name="roommates" options={{ title: 'Roommates', tabBarIcon: tabIcon('people') }} />
    </Tabs>
  );
}
// Carter Contribuation 
import { tabIcon } from '../../components/TabIcon';
import { Tabs } from 'expo-router';
import { SwitchRoleButton } from '../../components/athlete/SwitchRoleButton';
import { colors } from '../../lib/theme';

export default function StaffTabs() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.brown },
        headerTintColor: '#fff',
        headerRight: () => <SwitchRoleButton />,
        tabBarActiveTintColor: colors.orange,
        tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="season" options={{ title: 'Season', tabBarIcon: tabIcon('pie-chart') }} />
      <Tabs.Screen name="trips" options={{ title: 'Trips', headerShown: false, tabBarIcon: tabIcon('bus') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: tabIcon('options') }} />
      {/* AI usage/accuracy screen is dev-facing, not for coaches: kept as a route, hidden from the tab bar */}
      <Tabs.Screen name="ai" options={{ href: null, title: 'AI usage' }} />
    </Tabs>
  );
}

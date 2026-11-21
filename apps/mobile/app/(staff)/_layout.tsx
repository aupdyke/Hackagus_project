import { tabIcon } from '../../components/TabIcon';
import { Tabs } from 'expo-router';
import { colors } from '../../lib/theme';

export default function StaffTabs() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.brown },
        headerTintColor: '#fff',
        tabBarActiveTintColor: colors.orange,
        tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="season" options={{ title: 'Season', tabBarIcon: tabIcon('pie-chart') }} />
      <Tabs.Screen name="trips" options={{ title: 'Trips', headerShown: false, tabBarIcon: tabIcon('bus') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: tabIcon('options') }} />
      <Tabs.Screen name="ai" options={{ title: 'AI', tabBarIcon: tabIcon('sparkles') }} />
    </Tabs>
  );
}

import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RoleProvider } from '../lib/role';
import { colors } from '../lib/theme';

export default function RootLayout() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 10_000 } } }));
  // refetch on app foreground (inbox badge, my trip)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => focusManager.setFocused(s === 'active'));
    return () => sub.remove();
  }, []);
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <RoleProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerStyle: { backgroundColor: colors.brown }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '700' } }}>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="(staff)" options={{ headerShown: false }} />
            <Stack.Screen name="(athlete)" options={{ headerShown: false }} />
            <Stack.Screen name="dev/stream" options={{ title: 'Streaming test' }} />
          </Stack>
        </RoleProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

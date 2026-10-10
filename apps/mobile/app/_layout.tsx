import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiError } from '@emcom/api-client';
import { OfflineBanner } from '@/components/OfflineBanner';
import { refreshAccessToken } from '@/lib/api';
import { registerDevice, routeFromResponse, setupChannels } from '@/lib/notifications';
import { useSession } from '@/lib/session-store';
import { colors } from '@/lib/theme';

onlineManager.setEventListener((setOnline) => NetInfo.addEventListener((s) => setOnline(!!s.isConnected)));

export default function RootLayout() {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            retry: (n, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && n < 2,
          },
        },
      }),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => focusManager.setFocused(s === 'active'));
    void setupChannels();
    void (async () => {
      const refresh = await useSession.getState().hydrate();
      if (refresh) {
        const token = await refreshAccessToken();
        // Offline at launch: keep the stored user so cached screens work; API calls retry later.
        if (token) void registerDevice().catch(() => undefined);
      }
      useSession.setState({ ready: true });
    })();
    return () => sub.remove();
  }, []);

  // Notification taps (warm + cold start) deep-link to the exact incident in its community.
  useEffect(() => {
    const open = (r: Notifications.NotificationResponse) => {
      const route = routeFromResponse(r);
      if (useSession.getState().user) router.push(route as never);
      else useSession.getState().setPendingRoute(route);
    };
    void Notifications.getLastNotificationResponseAsync().then((r) => r && open(r));
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={qc}>
        <StatusBar style="dark" />
        <OfflineBanner />
        <Stack
          screenOptions={{
            headerTintColor: colors.ink,
            headerTitleStyle: { fontWeight: '800' },
            headerBackTitle: 'Back',
            contentStyle: { backgroundColor: colors.background },
            animation: Platform.OS === 'android' ? 'fade_from_bottom' : 'default',
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
          <Stack.Screen name="register" options={{ title: 'Create account' }} />
          <Stack.Screen name="login" options={{ title: 'Log in' }} />
          <Stack.Screen name="otp" options={{ title: 'Verify email' }} />
          <Stack.Screen name="forgot-password" options={{ title: 'Reset password' }} />
          <Stack.Screen name="notification-permission" options={{ title: 'Alerts', headerBackVisible: false }} />
          <Stack.Screen name="communities/index" options={{ title: 'My Communities', headerBackVisible: false }} />
          <Stack.Screen name="communities/create" options={{ title: 'Create community' }} />
          <Stack.Screen name="communities/join" options={{ title: 'Join community' }} />
          <Stack.Screen name="communities/pending/[communityId]" options={{ title: 'Join request' }} />
          <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
          <Stack.Screen name="account" options={{ title: 'Account' }} />
          <Stack.Screen name="c/[communityId]" options={{ headerShown: false }} />
        </Stack>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

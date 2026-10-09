import { Ionicons } from '@expo/vector-icons';
import { Tabs, useLocalSearchParams } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { router } from 'expo-router';
import { useCommunity } from '@/hooks/queries';
import { colors } from '@/lib/theme';

/** PRD §10 bottom navigation: Home | Alerts | History | Profile. */
export default function CommunityTabs() {
  const { communityId } = useLocalSearchParams<{ communityId: string }>();
  const { community } = useCommunity(communityId);
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.emergency,
        tabBarLabelStyle: { fontSize: 13, fontWeight: '700' },
        headerTitleStyle: { fontWeight: '900' },
        headerTitle: community?.name.toUpperCase() ?? '',
        headerRight: () => (
          <Pressable accessibilityRole="button" accessibilityLabel="Switch community" onPress={() => router.navigate('/communities')} style={{ paddingHorizontal: 14, minHeight: 48, justifyContent: 'center' }}>
            <Text style={{ color: colors.primary, fontWeight: '800' }}>Switch</Text>
          </Pressable>
        ),
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} /> }} />
      <Tabs.Screen name="alerts" options={{ title: 'Alerts', tabBarIcon: ({ color, size }) => <Ionicons name="warning" color={color} size={size} /> }} />
      <Tabs.Screen name="history" options={{ title: 'History', tabBarIcon: ({ color, size }) => <Ionicons name="time" color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" color={color} size={size} /> }} />
    </Tabs>
  );
}

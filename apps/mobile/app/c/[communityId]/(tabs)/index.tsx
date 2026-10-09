import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { CommunityTypeLabel } from '@emcom/shared-types';
import { EmergencyListItem, WhatsAppButton } from '@/components/emergency';
import { Body, Button, Card, ErrorView, Loading } from '@/components/ui';
import { useActiveEmergencies, useCommunity } from '@/hooks/queries';
import { api, messageOf } from '@/lib/api';
import { colors, radius, space } from '@/lib/theme';

/** Screen 10 — Member Home (PRD §10). Deliberately simple: status + two primary actions. */
export default function MemberHome() {
  const { communityId } = useLocalSearchParams<{ communityId: string }>();
  const { community, isAdmin, isLoading, error, refetch } = useCommunity(communityId);
  const active = useActiveEmergencies(communityId);
  const recent = useQuery({ queryKey: ['c', communityId, 'emergencies', 'recent'], queryFn: () => api.emergencies.list(communityId, { status: ['RESOLVED'], limit: 3 }) });

  if (isLoading) return <Loading />;
  if (error || !community) return <ErrorView message={error ? messageOf(error) : 'You do not have access to this community.'} onRetry={() => void refetch()} />;
  const activeItems = active.data?.items ?? [];
  const isNormal = activeItems.length === 0;

  return (
    <ScrollView contentContainerStyle={{ padding: space(5), gap: space(4) }} refreshControl={<RefreshControl refreshing={active.isRefetching} onRefresh={() => void Promise.all([active.refetch(), recent.refetch()])} />}>
      <View accessibilityRole="summary" accessibilityLabel={`${community.name}: ${isNormal ? 'community normal' : 'active emergency'}`} style={{ alignItems: 'center', gap: 6, paddingVertical: space(2) }}>
        <Text style={{ fontSize: 28, fontWeight: '900', color: colors.ink, textAlign: 'center' }}>{community.name.toUpperCase()}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: isNormal ? colors.safeSoft : colors.emergency, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 8 }}>
          <Ionicons name={isNormal ? 'shield-checkmark' : 'warning'} size={20} color={isNormal ? colors.safe : '#fff'} />
          <Text style={{ fontWeight: '900', color: isNormal ? colors.safe : '#fff', letterSpacing: 1 }}>{isNormal ? 'COMMUNITY NORMAL' : 'ACTIVE EMERGENCY'}</Text>
        </View>
      </View>

      {activeItems.map((e) => (
        <EmergencyListItem key={e.id} e={e} />
      ))}

      <Pressable
        testID="report-emergency"
        accessibilityRole="button"
        accessibilityLabel="Report emergency"
        accessibilityHint="Choose the emergency type and send a report to the community administrators"
        onPress={() => router.push(`/c/${communityId}/report`)}
        style={({ pressed }) => ({ backgroundColor: colors.primary, borderRadius: radius.lg, minHeight: 92, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 12, opacity: pressed ? 0.85 : 1 })}
      >
        <Ionicons name="megaphone" size={30} color="#fff" />
        <Text style={{ color: '#fff', fontSize: 21, fontWeight: '900', letterSpacing: 0.5 }}>REPORT EMERGENCY</Text>
      </Pressable>

      <Pressable
        testID="critical-alert"
        accessibilityRole="button"
        accessibilityLabel={`Critical alert for ${community.name}`}
        accessibilityHint="Opens a confirmation. Nothing is sent until you choose Yes, send alert."
        onPress={() => router.push(`/c/${communityId}/critical-confirm`)}
        style={({ pressed }) => ({ backgroundColor: colors.emergency, borderRadius: radius.lg, minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 4, borderColor: colors.emergencyDark, opacity: pressed ? 0.85 : 1 })}
      >
        <Ionicons name="alert-circle" size={40} color="#fff" />
        <Text style={{ color: '#fff', fontSize: 26, fontWeight: '900', letterSpacing: 1.5 }}>CRITICAL ALERT</Text>
        <Text style={{ color: '#fff', fontSize: 13 }}>Alerts the entire community immediately</Text>
      </Pressable>

      {isAdmin ? <Button title="ADMIN DASHBOARD" variant="outline" icon="shield-half-outline" onPress={() => router.push(`/c/${communityId}/admin`)} /> : null}

      <View style={{ gap: space(2) }}>
        <Text style={{ fontWeight: '900', fontSize: 16, color: colors.ink }}>Recent alerts</Text>
        {recent.data?.items.length ? recent.data.items.map((e) => <EmergencyListItem key={e.id} e={e} />) : <Body muted>No recent alerts.</Body>}
        <Button title="Emergency history" variant="ghost" onPress={() => router.push(`/c/${communityId}/history`)} />
      </View>

      <Card>
        <Text style={{ fontWeight: '900', fontSize: 16, color: colors.ink }}>Community information</Text>
        <Body>{CommunityTypeLabel[community.type]} · {community.location}</Body>
        {community.description ? <Body muted>{community.description}</Body> : null}
        <WhatsAppButton url={community.whatsappUrl} />
      </Card>
      <Body muted style={{ textAlign: 'center', fontSize: 13 }}>
        EMCOM does not replace police, fire or ambulance services.
      </Body>
    </ScrollView>
  );
}

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, newIdempotencyKey, type Coordinates } from '@emcom/api-client';
import { useCommunity } from '@/hooks/queries';
import { api, messageOf } from '@/lib/api';
import { getCurrentCoordinates } from '@/lib/location';
import { colors, radius, space } from '@/lib/theme';

/**
 * Screen 14 — Critical Alert Confirmation (PRD §13). Names the community explicitly.
 * NO, CANCEL makes no request at all. YES sends exactly one alert: the idempotency key is created
 * once per confirmation, so retries after a network error cannot create a second alert.
 */
export default function CriticalConfirm() {
  const { communityId } = useLocalSearchParams<{ communityId: string }>();
  const { community } = useCommunity(communityId);
  const key = useRef(newIdempotencyKey());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLocation, setShowLocation] = useState(false);
  const [location, setLocation] = useState('');
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [gpsState, setGpsState] = useState<'idle' | 'locating' | 'attached' | 'off'>('idle');

  // If location permission is ALREADY granted, fetch a fix silently while the user reads the
  // confirmation. Sending never waits for it: whatever is available at YES is attached.
  useEffect(() => {
    let alive = true;
    setGpsState('locating');
    void getCurrentCoordinates({ prompt: false, timeoutMs: 6000 }).then((r) => {
      if (!alive) return;
      if (r.ok) {
        setCoords(r.coords);
        setGpsState('attached');
      } else setGpsState('off');
    });
    return () => {
      alive = false;
    };
  }, []);

  async function shareGps() {
    setGpsState('locating');
    const r = await getCurrentCoordinates({ prompt: true, timeoutMs: 8000 });
    if (r.ok) {
      setCoords(r.coords);
      setGpsState('attached');
    } else setGpsState('off');
  }

  async function send() {
    if (sending) return;
    setSending(true);
    setError(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      const res = await api.emergencies.triggerCritical(communityId, key.current, {
        ...(location.trim() ? { location: location.trim() } : {}),
        ...(coords ? { coordinates: coords } : {}),
      });
      router.replace({ pathname: '/c/[communityId]/critical-sent/[emergencyId]', params: { communityId, emergencyId: res.emergency.id, coalesced: res.coalesced ? '1' : '0' } });
    } catch (e) {
      setError(
        e instanceof ApiError && e.isNetworkError
          ? 'NOT SENT — no connection. Tap YES again to retry. If lives are at risk, call emergency services now.'
          : `NOT SENT — ${messageOf(e)}`,
      );
      setSending(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.critical, padding: space(5), justifyContent: 'space-between' }}>
      <View style={{ alignItems: 'center', gap: space(3), marginTop: space(6) }}>
        <Ionicons name="alert-circle" size={72} color="#fff" />
        <Text accessibilityRole="header" style={{ color: '#fff', fontSize: 34, fontWeight: '900', letterSpacing: 2 }}>
          CRITICAL ALERT
        </Text>
        <Text testID="confirm-community" style={{ color: '#fff', fontSize: 26, fontWeight: '900', textAlign: 'center' }}>
          {community?.name ?? '…'}
        </Text>
        <Text style={{ color: '#fff', fontSize: 19, textAlign: 'center', fontWeight: '700' }}>Are you sure you want to send a Critical Alert?</Text>
        <Text style={{ color: '#fff', fontSize: 16, textAlign: 'center' }}>This will immediately alert the entire community.</Text>
        {showLocation ? (
          <TextInput
            accessibilityLabel="Location (optional)"
            placeholder="Where? (optional)"
            placeholderTextColor="#ffffffaa"
            value={location}
            onChangeText={setLocation}
            maxLength={160}
            style={{ alignSelf: 'stretch', minHeight: 48, borderRadius: radius.md, borderWidth: 1.5, borderColor: '#fff', color: '#fff', paddingHorizontal: 14, fontSize: 17 }}
          />
        ) : (
          <Pressable accessibilityRole="button" onPress={() => setShowLocation(true)} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ color: '#fff', textDecorationLine: 'underline', fontSize: 15 }}>Add location (optional)</Text>
          </Pressable>
        )}
        {gpsState === 'attached' ? (
          <Text accessibilityLiveRegion="polite" style={{ color: '#fff', fontSize: 14 }}>
            📍 Your GPS location will be included{coords?.accuracyM != null ? ` (±${coords.accuracyM} m)` : ''}
          </Text>
        ) : gpsState === 'off' ? (
          <Pressable accessibilityRole="button" onPress={() => void shareGps()} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ color: '#fff', textDecorationLine: 'underline', fontSize: 15 }}>Share my GPS location (optional)</Text>
          </Pressable>
        ) : null}
        {error ? (
          <View accessibilityRole="alert" style={{ backgroundColor: '#fff', borderRadius: radius.md, padding: space(3), alignSelf: 'stretch', gap: 6 }}>
            <Text style={{ color: colors.emergency, fontWeight: '900' }}>{error}</Text>
            <Pressable accessibilityRole="button" onPress={() => void Linking.openURL('tel:112')} style={{ minHeight: 44, justifyContent: 'center' }}>
              <Text style={{ color: colors.primary, fontWeight: '800' }}>Call emergency services (112)</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
      <View style={{ gap: space(3) }}>
        <Pressable
          testID="confirm-yes"
          accessibilityRole="button"
          accessibilityLabel={`Yes, send alert to ${community?.name ?? 'community'}`}
          accessibilityState={{ busy: sending }}
          onPress={send}
          style={({ pressed }) => ({ backgroundColor: '#fff', minHeight: 72, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', opacity: pressed || sending ? 0.8 : 1 })}
        >
          <Text style={{ color: colors.critical, fontSize: 22, fontWeight: '900' }}>{sending ? 'SENDING…' : 'YES, SEND ALERT'}</Text>
        </Pressable>
        <Pressable
          testID="confirm-no"
          accessibilityRole="button"
          accessibilityLabel="No, cancel. Nothing will be sent."
          disabled={sending}
          onPress={() => router.back()}
          style={{ minHeight: 64, borderRadius: radius.lg, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: '#fff', fontSize: 19, fontWeight: '900' }}>NO, CANCEL</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

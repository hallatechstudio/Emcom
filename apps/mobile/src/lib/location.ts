import * as Location from 'expo-location';
import type { Coordinates } from '@emcom/api-client';

export type LocationResult = { ok: true; coords: Coordinates } | { ok: false; reason: 'denied' | 'unavailable' };

/**
 * One-off GPS fix for an emergency report. Never blocks sending: callers race it against the user.
 * `prompt=false` only uses an already-granted permission (no system dialog).
 */
export async function getCurrentCoordinates(opts: { prompt: boolean; timeoutMs?: number } = { prompt: true }): Promise<LocationResult> {
  const current = await Location.getForegroundPermissionsAsync();
  let granted = current.granted;
  if (!granted && opts.prompt && current.canAskAgain) granted = (await Location.requestForegroundPermissionsAsync()).granted;
  if (!granted) return { ok: false, reason: 'denied' };
  try {
    const fix = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<null>((r) => setTimeout(() => r(null), opts.timeoutMs ?? 8000)),
    ]);
    const pos = fix ?? (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 }));
    if (!pos) return { ok: false, reason: 'unavailable' };
    return {
      ok: true,
      coords: {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracyM: pos.coords.accuracy != null ? Math.round(pos.coords.accuracy) : undefined,
      },
    };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

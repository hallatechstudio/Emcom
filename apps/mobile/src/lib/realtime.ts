import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { io, Socket } from 'socket.io-client';
import { RealtimeEvent, type RealtimeEnvelope } from '@emcom/shared-types';
import { refreshAccessToken } from './api';
import { API_URL } from './config';
import { useSession } from './session-store';

type Incoming = (emergencyId: string) => void;

/**
 * Foreground realtime for one community. Events carry ids only; the app refetches through the
 * authorized API. Reconnects and app-resume trigger a full refetch (covers anything missed).
 * Push notifications — not this socket — are what reach backgrounded or sleeping phones.
 */
export function useCommunityRealtime(communityId: string | undefined, onIncomingAlert?: Incoming) {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const incomingRef = useRef(onIncomingAlert);
  incomingRef.current = onIncomingAlert;

  useEffect(() => {
    if (!communityId) return;
    const seen = new Set<string>();
    const invalidate = () => qc.invalidateQueries({ queryKey: ['c', communityId] });
    const socket: Socket = io(`${API_URL}/realtime`, {
      transports: ['websocket'],
      auth: (cb) => cb({ token: useSession.getState().accessToken }),
      reconnectionDelayMax: 10_000,
    });

    socket.on('connect', async () => {
      const ack = (await socket.timeout(5000).emitWithAck(RealtimeEvent.JOIN_COMMUNITY, { communityId }).catch(() => null)) as { ok: boolean } | null;
      setConnected(!!ack?.ok);
      void invalidate();
    });
    socket.on('disconnect', async (reason) => {
      setConnected(false);
      if (reason === 'io server disconnect') {
        await refreshAccessToken();
        socket.connect();
      }
    });
    const handler = (e: RealtimeEnvelope<{ emergencyId?: string; status?: string }>) => {
      if (e.communityId !== communityId || seen.has(e.eventId)) return;
      seen.add(e.eventId);
      void invalidate();
      void qc.invalidateQueries({ queryKey: ['inbox'] });
    };
    socket.on(RealtimeEvent.EMERGENCY_CHANGED, handler);
    socket.on(RealtimeEvent.EMERGENCY_UPDATE, handler);
    socket.on(RealtimeEvent.ACK_CHANGED, handler);
    socket.on(RealtimeEvent.MEMBERSHIP_CHANGED, handler);
    socket.on(RealtimeEvent.EMERGENCY_CREATED, (e: RealtimeEnvelope<{ emergencyId?: string; status?: string }>) => {
      const fresh = !seen.has(e.eventId);
      handler(e);
      if (fresh && e.data.status === 'ACTIVE' && e.data.emergencyId) incomingRef.current?.(e.data.emergencyId);
    });
    socket.on(RealtimeEvent.ACCESS_REVOKED, () => {
      void qc.invalidateQueries();
    });

    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        if (!socket.connected) socket.connect();
        void invalidate();
      }
    });
    return () => {
      sub.remove();
      socket.disconnect();
    };
  }, [communityId, qc]);

  return connected;
}

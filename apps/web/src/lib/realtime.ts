'use client';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { RealtimeEvent, type RealtimeEnvelope } from '@emcom/shared-types';
import { API_URL, getAccessToken, refreshSession } from './api';

/**
 * Subscribes to a community room and invalidates the affected queries. Events only carry ids, so
 * the UI always refetches through the authorized REST API. On (re)connect everything is refetched,
 * which covers events missed while offline. Duplicate events are ignored by eventId.
 */
export function useCommunityRealtime(communityId: string | undefined) {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!communityId) return;
    const seen = new Set<string>();
    let socket: Socket | null = null;
    let cancelled = false;

    const handle = (e: RealtimeEnvelope<{ emergencyId?: string }>) => {
      if (e.communityId !== communityId || seen.has(e.eventId)) return;
      seen.add(e.eventId);
      if (seen.size > 500) seen.clear();
      void qc.invalidateQueries({ queryKey: ['community', communityId] });
    };

    socket = io(`${API_URL}/realtime`, {
      transports: ['websocket'],
      auth: (cb) => cb({ token: getAccessToken() }),
      reconnectionDelayMax: 10_000,
    });
    socket.on('connect', async () => {
      const ack = (await socket!.timeout(5000).emitWithAck(RealtimeEvent.JOIN_COMMUNITY, { communityId }).catch(() => null)) as { ok: boolean } | null;
      if (cancelled) return;
      setConnected(!!ack?.ok);
      void qc.invalidateQueries({ queryKey: ['community', communityId] });
    });
    socket.on('disconnect', async (reason) => {
      setConnected(false);
      // Server disconnects when the access token expires — refresh before the client retries.
      if (reason === 'io server disconnect') {
        await refreshSession();
        socket?.connect();
      }
    });
    for (const evt of [RealtimeEvent.EMERGENCY_CREATED, RealtimeEvent.EMERGENCY_CHANGED, RealtimeEvent.EMERGENCY_UPDATE, RealtimeEvent.ACK_CHANGED, RealtimeEvent.MEMBERSHIP_CHANGED]) {
      socket.on(evt, handle);
    }
    socket.on(RealtimeEvent.ACCESS_REVOKED, () => void qc.invalidateQueries());

    return () => {
      cancelled = true;
      socket?.disconnect();
    };
  }, [communityId, qc]);

  return connected;
}

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { io, Socket } from 'socket.io-client';
import { RealtimeEvent, type RealtimeEnvelope } from '@emcom/shared-types';
import { api, refreshAccessToken } from './api';
import { API_URL } from './config';
import { presentIncoming } from './incoming';
import { useSession } from './session-store';

const RealtimeContext = createContext<{ connected: boolean }>({ connected: false });
export const useRealtimeStatus = () => useContext(RealtimeContext);

/**
 * One authenticated socket for the whole app, joined to EVERY community where the user is an
 * approved member, so a new emergency in any of them surfaces while the app is open — not just in
 * the community on screen. Events carry ids only; screens refetch through the authorized API.
 * Push notifications remain the path for backgrounded/locked phones.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const user = useSession((s) => s.user);
  const hasToken = useSession((s) => !!s.accessToken);
  const mine = useQuery({ queryKey: ['mine'], queryFn: () => api.communities.mine(), enabled: !!user && hasToken });
  const approved = (mine.data ?? []).filter((m) => m.membership.status === 'APPROVED').map((m) => m.community.id);
  const approvedKey = approved.sort().join(',');
  const socketRef = useRef<Socket | null>(null);
  const joined = useRef(new Set<string>());
  const [connected, setConnected] = useState(false);

  // Connect once per signed-in session.
  useEffect(() => {
    if (!user || !hasToken) return;
    const seen = new Set<string>();
    const socket = io(`${API_URL}/realtime`, {
      transports: ['websocket'],
      auth: (cb) => cb({ token: useSession.getState().accessToken }),
      reconnectionDelayMax: 10_000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      joined.current.clear();
      void qc.invalidateQueries({ queryKey: ['mine'] }).then(() => joinAll());
      void qc.invalidateQueries({ queryKey: ['c'] });
    });
    socket.on('disconnect', async (reason) => {
      setConnected(false);
      if (reason === 'io server disconnect') {
        await refreshAccessToken();
        socket.connect();
      }
    });
    const refresh = (e: RealtimeEnvelope<{ emergencyId?: string; status?: string }>) => {
      if (seen.has(e.eventId)) return false;
      seen.add(e.eventId);
      if (seen.size > 1000) seen.clear();
      void qc.invalidateQueries({ queryKey: ['c', e.communityId] });
      void qc.invalidateQueries({ queryKey: ['mine'] });
      void qc.invalidateQueries({ queryKey: ['inbox'] });
      return true;
    };
    for (const evt of [RealtimeEvent.EMERGENCY_CHANGED, RealtimeEvent.EMERGENCY_UPDATE, RealtimeEvent.ACK_CHANGED, RealtimeEvent.MEMBERSHIP_CHANGED]) socket.on(evt, refresh);
    socket.on(RealtimeEvent.EMERGENCY_CREATED, (e: RealtimeEnvelope<{ emergencyId?: string; status?: string }>) => {
      if (refresh(e) && e.data.status === 'ACTIVE' && e.data.emergencyId) void presentIncoming(e.communityId, e.data.emergencyId);
    });
    socket.on(RealtimeEvent.ACCESS_REVOKED, (e: RealtimeEnvelope) => {
      joined.current.delete(e.communityId);
      void qc.invalidateQueries();
    });

    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        if (!socket.connected) socket.connect();
        void qc.invalidateQueries({ queryKey: ['c'] });
        void qc.invalidateQueries({ queryKey: ['mine'] });
      }
    });
    return () => {
      sub.remove();
      socket.disconnect();
      socketRef.current = null;
      joined.current.clear();
      setConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, hasToken, qc]);

  async function joinAll() {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    const list = (qc.getQueryData<{ community: { id: string }; membership: { status: string } }[]>(['mine']) ?? [])
      .filter((m) => m.membership.status === 'APPROVED')
      .map((m) => m.community.id);
    for (const communityId of list) {
      if (joined.current.has(communityId)) continue;
      const ack = (await socket.timeout(5000).emitWithAck(RealtimeEvent.JOIN_COMMUNITY, { communityId }).catch(() => null)) as { ok: boolean } | null;
      if (ack?.ok) joined.current.add(communityId);
    }
  }

  // Join newly approved communities as the membership list changes.
  useEffect(() => {
    void joinAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvedKey]);

  return <RealtimeContext.Provider value={{ connected }}>{children}</RealtimeContext.Provider>;
}


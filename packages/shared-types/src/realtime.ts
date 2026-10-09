/** Socket.IO contract. All server→client events carry communityId so clients can drop strays. */
export const RealtimeEvent = {
  /** client → server */
  JOIN_COMMUNITY: 'community:join',
  LEAVE_COMMUNITY: 'community:leave',
  /** server → client */
  EMERGENCY_CREATED: 'emergency:created',
  EMERGENCY_CHANGED: 'emergency:changed',
  EMERGENCY_UPDATE: 'emergency:update',
  ACK_CHANGED: 'emergency:ack',
  MEMBERSHIP_CHANGED: 'membership:changed',
  ACCESS_REVOKED: 'community:revoked',
  NOTIFICATION: 'notification:new',
} as const;
export type RealtimeEvent = (typeof RealtimeEvent)[keyof typeof RealtimeEvent];

export interface RealtimeEnvelope<T = unknown> {
  communityId: string;
  /** Emergency-scoped monotonically increasing sequence (timeline order) when applicable. */
  emergencyId?: string;
  seq?: number;
  /** Unique id for duplicate-safe client handling. */
  eventId: string;
  occurredAt: string;
  data: T;
}

export interface JoinAck {
  ok: boolean;
  error?: string;
}

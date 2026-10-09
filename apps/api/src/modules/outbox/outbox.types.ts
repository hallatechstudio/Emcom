/** Outbox event types. Each maps to a fan-out handler in the worker (notifications/fanout.service.ts). */
export const OutboxType = {
  JOIN_REQUESTED: 'membership.join_requested',
  MEMBERSHIP_DECIDED: 'membership.decided',
  EMERGENCY_REPORTED: 'emergency.reported',
  EMERGENCY_BROADCAST: 'emergency.broadcast',
  EMERGENCY_UPDATE: 'emergency.update',
  EMERGENCY_RESOLVED: 'emergency.resolved',
  EMERGENCY_DISMISSED: 'emergency.dismissed',
} as const;
export type OutboxType = (typeof OutboxType)[keyof typeof OutboxType];

export interface OutboxPayloads {
  'membership.join_requested': { membershipId: string };
  'membership.decided': { membershipId: string; decision: 'APPROVED' | 'REJECTED' };
  'emergency.reported': { emergencyId: string };
  'emergency.broadcast': { emergencyId: string; alertId: string; queuedAt: string };
  'emergency.update': { emergencyId: string; updateId: string };
  'emergency.resolved': { emergencyId: string };
  'emergency.dismissed': { emergencyId: string };
}

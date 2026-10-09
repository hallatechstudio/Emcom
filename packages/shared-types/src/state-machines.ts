import { EmergencyStatus, MembershipRole, MembershipStatus } from './enums';

/**
 * Emergency lifecycle (PRD §12, §14, §19).
 *   NORMAL:   PENDING → ACTIVE (confirm & broadcast) → RESOLVED
 *             PENDING → DISMISSED
 *   CRITICAL: created directly as ACTIVE → RESOLVED
 * DISMISSED and RESOLVED are terminal.
 */
export const EMERGENCY_TRANSITIONS: Record<EmergencyStatus, readonly EmergencyStatus[]> = {
  PENDING: ['ACTIVE', 'DISMISSED'],
  ACTIVE: ['RESOLVED'],
  DISMISSED: [],
  RESOLVED: [],
};

export function canTransitionEmergency(from: EmergencyStatus, to: EmergencyStatus): boolean {
  return EMERGENCY_TRANSITIONS[from].includes(to);
}

/**
 * Membership lifecycle. Who may drive each edge is enforced in the API policy layer.
 *   (new)     → PENDING   join request
 *   PENDING   → APPROVED | REJECTED (admin) | LEFT (requester withdraws)
 *   APPROVED  → SUSPENDED | REMOVED (admin) | LEFT (member leaves)
 *   SUSPENDED → APPROVED (reinstate) | REMOVED
 *   REJECTED | REMOVED | LEFT → PENDING (new join request with a valid code)
 */
export const MEMBERSHIP_TRANSITIONS: Record<MembershipStatus, readonly MembershipStatus[]> = {
  PENDING: ['APPROVED', 'REJECTED', 'LEFT'],
  APPROVED: ['SUSPENDED', 'REMOVED', 'LEFT'],
  SUSPENDED: ['APPROVED', 'REMOVED'],
  REJECTED: ['PENDING'],
  REMOVED: ['PENDING'],
  LEFT: ['PENDING'],
};

export function canTransitionMembership(from: MembershipStatus, to: MembershipStatus): boolean {
  return MEMBERSHIP_TRANSITIONS[from].includes(to);
}

const ROLE_RANK: Record<MembershipRole, number> = { MEMBER: 1, ADMIN: 2, OWNER: 3 };

export function roleAtLeast(role: MembershipRole, required: MembershipRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

/** An actor may moderate (suspend/remove/reinstate) only members ranked strictly below them. */
export function canModerate(actor: MembershipRole, target: MembershipRole): boolean {
  return ROLE_RANK[actor] > ROLE_RANK[target];
}

export function isAdminRole(role: MembershipRole): boolean {
  return role === 'ADMIN' || role === 'OWNER';
}

export function isActiveMembership(status: MembershipStatus): boolean {
  return status === MembershipStatus.APPROVED;
}

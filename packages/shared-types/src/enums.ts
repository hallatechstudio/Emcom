/**
 * Domain enums shared by API, worker, web and mobile.
 * Values mirror the Prisma enums in apps/api/prisma/schema.prisma — keep them in sync
 * (apps/api/test/unit/shared-enums.spec.ts fails the build if they drift).
 */

export const CommunityType = {
  ESTATE: 'ESTATE',
  NEIGHBORHOOD: 'NEIGHBORHOOD',
  CHURCH: 'CHURCH',
  SCHOOL: 'SCHOOL',
  WORKPLACE: 'WORKPLACE',
  HOTEL: 'HOTEL',
  APARTMENT_COMPLEX: 'APARTMENT_COMPLEX',
  INDUSTRIAL_FACILITY: 'INDUSTRIAL_FACILITY',
  OTHER: 'OTHER',
} as const;
export type CommunityType = (typeof CommunityType)[keyof typeof CommunityType];

export const CommunityTypeLabel: Record<CommunityType, string> = {
  ESTATE: 'Estate',
  NEIGHBORHOOD: 'Neighborhood',
  CHURCH: 'Church',
  SCHOOL: 'School',
  WORKPLACE: 'Workplace',
  HOTEL: 'Hotel',
  APARTMENT_COMPLEX: 'Apartment complex',
  INDUSTRIAL_FACILITY: 'Industrial facility',
  OTHER: 'Other',
};

export const MembershipRole = { OWNER: 'OWNER', ADMIN: 'ADMIN', MEMBER: 'MEMBER' } as const;
export type MembershipRole = (typeof MembershipRole)[keyof typeof MembershipRole];

export const MembershipStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  SUSPENDED: 'SUSPENDED',
  REMOVED: 'REMOVED',
  LEFT: 'LEFT',
} as const;
export type MembershipStatus = (typeof MembershipStatus)[keyof typeof MembershipStatus];

export const EmergencyPathway = { NORMAL: 'NORMAL', CRITICAL: 'CRITICAL' } as const;
export type EmergencyPathway = (typeof EmergencyPathway)[keyof typeof EmergencyPathway];

export const EmergencyStatus = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  DISMISSED: 'DISMISSED',
  RESOLVED: 'RESOLVED',
} as const;
export type EmergencyStatus = (typeof EmergencyStatus)[keyof typeof EmergencyStatus];

/** PRD §11 (p.7): the seven emergency types, in the documented order. */
export const EmergencyCategory = {
  FIRE: 'FIRE',
  SECURITY_THREAT: 'SECURITY_THREAT',
  MEDICAL_EMERGENCY: 'MEDICAL_EMERGENCY',
  ELECTRICAL_EMERGENCY: 'ELECTRICAL_EMERGENCY',
  GAS_LEAK: 'GAS_LEAK',
  FLOOD: 'FLOOD',
  OTHER: 'OTHER',
} as const;
export type EmergencyCategory = (typeof EmergencyCategory)[keyof typeof EmergencyCategory];

export const EmergencyCategoryLabel: Record<EmergencyCategory, string> = {
  FIRE: 'Fire',
  SECURITY_THREAT: 'Security Threat',
  MEDICAL_EMERGENCY: 'Medical Emergency',
  ELECTRICAL_EMERGENCY: 'Electrical Emergency',
  GAS_LEAK: 'Gas Leak',
  FLOOD: 'Flood',
  OTHER: 'Other',
};

export const EmergencyEventType = {
  REPORTED: 'REPORTED',
  CRITICAL_ALERT_TRIGGERED: 'CRITICAL_ALERT_TRIGGERED',
  ADDITIONAL_TRIGGER: 'ADDITIONAL_TRIGGER',
  CONFIRMED: 'CONFIRMED',
  DISMISSED: 'DISMISSED',
  COMMUNITY_ALERTED: 'COMMUNITY_ALERTED',
  UPDATE_SENT: 'UPDATE_SENT',
  RESOLVED: 'RESOLVED',
  REMINDER_SENT: 'REMINDER_SENT',
} as const;
export type EmergencyEventType = (typeof EmergencyEventType)[keyof typeof EmergencyEventType];

export const EmergencyEventLabel: Record<EmergencyEventType, string> = {
  REPORTED: 'Emergency reported',
  CRITICAL_ALERT_TRIGGERED: 'Critical alert triggered',
  ADDITIONAL_TRIGGER: 'Additional critical alert trigger',
  CONFIRMED: 'Admin confirmed',
  DISMISSED: 'Report dismissed',
  COMMUNITY_ALERTED: 'Community alerted',
  UPDATE_SENT: 'Update sent',
  RESOLVED: 'Emergency resolved',
  REMINDER_SENT: 'Reminder sent to members who have not acknowledged',
};

/** PRD §25 (p.16) notification catalogue. REPORT_DISMISSED is an engineering extension. */
export const NotificationType = {
  JOIN_REQUEST: 'JOIN_REQUEST',
  MEMBERSHIP_APPROVED: 'MEMBERSHIP_APPROVED',
  MEMBERSHIP_REJECTED: 'MEMBERSHIP_REJECTED',
  EMERGENCY_REPORT_RECEIVED: 'EMERGENCY_REPORT_RECEIVED',
  EMERGENCY_CONFIRMED: 'EMERGENCY_CONFIRMED',
  EMERGENCY_BROADCAST: 'EMERGENCY_BROADCAST',
  CRITICAL_ALERT: 'CRITICAL_ALERT',
  EMERGENCY_UPDATE: 'EMERGENCY_UPDATE',
  EMERGENCY_RESOLVED: 'EMERGENCY_RESOLVED',
  REPORT_DISMISSED: 'REPORT_DISMISSED',
  EMERGENCY_REMINDER: 'EMERGENCY_REMINDER',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export const NotificationPriority = { NORMAL: 'NORMAL', HIGH: 'HIGH', CRITICAL: 'CRITICAL' } as const;
export type NotificationPriority = (typeof NotificationPriority)[keyof typeof NotificationPriority];

export const DeliveryStatus = {
  QUEUED: 'QUEUED',
  PROVIDER_ACCEPTED: 'PROVIDER_ACCEPTED',
  FAILED: 'FAILED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  SKIPPED: 'SKIPPED',
} as const;
export type DeliveryStatus = (typeof DeliveryStatus)[keyof typeof DeliveryStatus];

export const DevicePlatform = { IOS: 'IOS', ANDROID: 'ANDROID', WEB: 'WEB' } as const;
export type DevicePlatform = (typeof DevicePlatform)[keyof typeof DevicePlatform];

export const PushProviderName = { MOCK: 'MOCK', EXPO: 'EXPO', FCM: 'FCM' } as const;
export type PushProviderName = (typeof PushProviderName)[keyof typeof PushProviderName];

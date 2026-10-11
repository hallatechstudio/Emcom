import type { EmergencyCategory, NotificationPriority, NotificationType } from '@prisma/client';
import { EmergencyCategoryLabel } from '@emcom/shared-types';
import { env } from '../../config/env';

export interface NotificationContent {
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  body: string;
}

const clip = (s: string, n = 160) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const cat = (c: EmergencyCategory | null) => (c ? EmergencyCategoryLabel[c] : 'Emergency');
const detail = (s: string) => (env().PUSH_INCLUDE_DETAILS ? s : 'Open EMCOM for details.');

/** Copy follows PRD §14–§19 wording. Push bodies stay short; full detail lives behind auth in the app. */
export const Content = {
  criticalAlert: (community: string, location: string | null): NotificationContent => ({
    type: 'CRITICAL_ALERT',
    priority: 'CRITICAL',
    title: `EMERGENCY! ${community}`,
    body: `A critical alert has been triggered for your community.${location ? ` Location: ${clip(location, 60)}.` : ''}`,
  }),
  broadcast: (community: string, category: EmergencyCategory | null, location: string | null, instructions: string | null): NotificationContent => ({
    type: 'EMERGENCY_BROADCAST',
    priority: 'CRITICAL',
    title: `ACTIVE EMERGENCY: ${cat(category).toUpperCase()} · ${community}`,
    body: detail(clip([location, instructions].filter(Boolean).join(' — ') || 'Open EMCOM now.')),
  }),
  reportReceived: (community: string, category: EmergencyCategory | null, location: string | null): NotificationContent => ({
    type: 'EMERGENCY_REPORT_RECEIVED',
    priority: 'HIGH',
    title: `New emergency report · ${community}`,
    body: `${cat(category)} reported${location ? ` at ${clip(location, 60)}` : ''}. Review now.`,
  }),
  confirmed: (community: string, category: EmergencyCategory | null): NotificationContent => ({
    type: 'EMERGENCY_CONFIRMED',
    priority: 'HIGH',
    title: 'Your report was confirmed',
    body: `Admins confirmed your ${cat(category).toLowerCase()} report and alerted ${community}.`,
  }),
  update: (community: string, category: EmergencyCategory | null, message: string): NotificationContent => ({
    type: 'EMERGENCY_UPDATE',
    priority: 'HIGH',
    title: `Update: ${cat(category)} · ${community}`,
    body: detail(clip(message)),
  }),
  resolved: (community: string, category: EmergencyCategory | null, message: string | null): NotificationContent => ({
    type: 'EMERGENCY_RESOLVED',
    priority: 'HIGH',
    title: `RESOLVED: ${cat(category)} · ${community}`,
    body: detail(clip(message ?? 'The emergency has been resolved.')),
  }),
  reminder: (community: string, category: EmergencyCategory | null, pathway: 'NORMAL' | 'CRITICAL'): NotificationContent => ({
    type: 'EMERGENCY_REMINDER',
    priority: 'CRITICAL',
    title: `REMINDER: ${pathway === 'CRITICAL' ? 'CRITICAL ALERT' : `${cat(category).toUpperCase()} EMERGENCY`} · ${community}`,
    body: 'An emergency is still active in your community. Open EMCOM and acknowledge the alert.',
  }),
  dismissed: (community: string): NotificationContent => ({
    type: 'REPORT_DISMISSED',
    priority: 'NORMAL',
    title: 'Your report was reviewed',
    body: `An administrator of ${community} reviewed your report and did not broadcast it.`,
  }),
  joinRequest: (community: string, name: string): NotificationContent => ({
    type: 'JOIN_REQUEST',
    priority: 'NORMAL',
    title: `New join request · ${community}`,
    body: `${clip(name, 60)} asked to join. Review the request.`,
  }),
  approved: (community: string): NotificationContent => ({
    type: 'MEMBERSHIP_APPROVED',
    priority: 'NORMAL',
    title: 'Request approved',
    body: `You are now a member of ${community} and will receive its emergency alerts.`,
  }),
  rejected: (community: string): NotificationContent => ({
    type: 'MEMBERSHIP_REJECTED',
    priority: 'NORMAL',
    title: 'Request not approved',
    body: `Your request to join ${community} was not approved.`,
  }),
};

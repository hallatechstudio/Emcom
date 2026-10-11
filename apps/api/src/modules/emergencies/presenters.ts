import type { Prisma } from '@prisma/client';
import type { EmergencyDto, EmergencyEventDto, EmergencyUpdateDto } from '@emcom/shared-types';
import { ALLOWED_MEDIA_TYPES } from '@emcom/shared-types';

export const emergencyInclude = (userId: string) =>
  ({
    community: { select: { name: true } },
    reporter: { select: { id: true, fullName: true } },
    alert: {
      select: {
        id: true,
        broadcastAt: true,
        recipientCount: true,
        acknowledgments: { where: { userId }, select: { acknowledgedAt: true } },
      },
    },
    updates: { orderBy: { createdAt: 'desc' }, take: 1, include: { author: { select: { id: true, fullName: true } } } },
    media: { where: { status: 'ATTACHED' }, select: { id: true, contentType: true, sizeBytes: true } },
  }) satisfies Prisma.EmergencyInclude;

export type EmergencyWithRelations = Prisma.EmergencyGetPayload<{ include: ReturnType<typeof emergencyInclude> }>;

/**
 * Reporter identity is visible to admins and to the reporter. Other members see the incident
 * without who raised it (privacy default; see docs/assumptions.md A-14).
 */
export function toEmergencyDto(e: EmergencyWithRelations, viewer: { userId: string; isAdmin: boolean }): EmergencyDto {
  const showReporter = viewer.isAdmin || e.reporterId === viewer.userId;
  const latest = e.updates[0];
  return {
    id: e.id,
    communityId: e.communityId,
    communityName: e.community.name,
    pathway: e.pathway,
    status: e.status,
    category: e.category,
    location: e.location,
    coordinates:
      e.latitude != null && e.longitude != null
        ? { latitude: e.latitude, longitude: e.longitude, accuracyM: e.locationAccuracyM }
        : null,
    description: e.description,
    instructions: e.instructions,
    reporter: showReporter ? e.reporter : null,
    reportedAt: e.createdAt.toISOString(),
    confirmedAt: e.confirmedAt?.toISOString() ?? null,
    dismissedAt: e.dismissedAt?.toISOString() ?? null,
    dismissalReason: viewer.isAdmin ? e.dismissalReason : null,
    resolvedAt: e.resolvedAt?.toISOString() ?? null,
    resolutionMessage: e.resolutionMessage,
    latestUpdate: latest ? toUpdateDto(latest) : null,
    alert: e.alert
      ? { id: e.alert.id, broadcastAt: e.alert.broadcastAt.toISOString(), recipientCount: e.alert.recipientCount }
      : null,
    media: e.media.map((m) => ({
      id: m.id,
      contentType: m.contentType,
      sizeBytes: m.sizeBytes,
      kind: ALLOWED_MEDIA_TYPES[m.contentType as keyof typeof ALLOWED_MEDIA_TYPES] ?? 'PHOTO',
    })),
    myAcknowledgedAt: e.alert?.acknowledgments[0]?.acknowledgedAt.toISOString() ?? null,
    additionalTriggerCount: e.additionalTriggerCount,
  };
}

export function toUpdateDto(u: {
  id: string;
  emergencyId: string;
  message: string;
  createdAt: Date;
  author: { id: string; fullName: string };
}): EmergencyUpdateDto {
  return { id: u.id, emergencyId: u.emergencyId, message: u.message, author: u.author, createdAt: u.createdAt.toISOString() };
}

const REPORTER_EVENTS = new Set(['REPORTED', 'CRITICAL_ALERT_TRIGGERED', 'ADDITIONAL_TRIGGER']);

export function toEventDto(
  ev: { id: string; seq: number; type: EmergencyEventDto['type']; message: string | null; createdAt: Date; actorId: string | null; actor: { id: string; fullName: string } | null },
  viewer: { userId: string; isAdmin: boolean },
): EmergencyEventDto {
  const hideActor = !viewer.isAdmin && REPORTER_EVENTS.has(ev.type) && ev.actorId !== viewer.userId;
  return {
    id: ev.id,
    seq: ev.seq,
    type: ev.type,
    message: ev.message,
    actor: hideActor ? null : ev.actor,
    createdAt: ev.createdAt.toISOString(),
  };
}

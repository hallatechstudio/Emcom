import type {
  CommunityType,
  DeliveryStatus,
  DevicePlatform,
  EmergencyCategory,
  EmergencyEventType,
  EmergencyPathway,
  EmergencyStatus,
  MembershipRole,
  MembershipStatus,
  NotificationPriority,
  NotificationType,
  PushProviderName,
} from './enums';

/** Standard error envelope returned by every non-2xx API response. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

export interface UserDto {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface AuthTokensDto {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export interface AuthResultDto extends AuthTokensDto {
  user: UserDto;
}

export interface IdentificationFieldDto {
  label: string;
  required: boolean;
}

export interface CommunityPreviewDto {
  id: string;
  name: string;
  type: CommunityType;
  location: string;
  description: string;
  identificationField: IdentificationFieldDto | null;
}

export interface CommunityDto extends CommunityPreviewDto {
  whatsappUrl: string | null;
  createdAt: string;
  /** Present only for admins/owners. */
  inviteCode?: string;
  inviteCodeRotatedAt?: string;
}

export interface MyCommunityDto {
  community: CommunityDto;
  membership: MembershipDto;
  /** Count of ACTIVE emergencies visible to the caller ("COMMUNITY NORMAL" when 0). */
  activeEmergencyCount: number;
}

export interface MembershipDto {
  id: string;
  communityId: string;
  userId: string;
  role: MembershipRole;
  status: MembershipStatus;
  identificationValue: string | null;
  requestedAt: string;
  decidedAt: string | null;
  updatedAt: string;
}

export interface MemberListItemDto extends MembershipDto {
  user: Pick<UserDto, 'id' | 'fullName' | 'email' | 'phone'>;
}

export interface MediaDto {
  id: string;
  contentType: string;
  sizeBytes: number;
  kind: 'PHOTO' | 'VIDEO';
}

export interface PresignedUploadDto {
  mediaId: string;
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: string;
}

export interface EmergencyUpdateDto {
  id: string;
  emergencyId: string;
  message: string;
  author: { id: string; fullName: string };
  createdAt: string;
}

export interface EmergencyEventDto {
  id: string;
  seq: number;
  type: EmergencyEventType;
  message: string | null;
  actor: { id: string; fullName: string } | null;
  createdAt: string;
}

export interface EmergencyAlertSummaryDto {
  id: string;
  broadcastAt: string;
  recipientCount: number;
}

export interface EmergencyDto {
  id: string;
  communityId: string;
  communityName: string;
  pathway: EmergencyPathway;
  status: EmergencyStatus;
  category: EmergencyCategory | null;
  location: string | null;
  description: string | null;
  instructions: string | null;
  reporter: { id: string; fullName: string } | null;
  reportedAt: string;
  confirmedAt: string | null;
  dismissedAt: string | null;
  dismissalReason: string | null;
  resolvedAt: string | null;
  resolutionMessage: string | null;
  latestUpdate: EmergencyUpdateDto | null;
  alert: EmergencyAlertSummaryDto | null;
  media: MediaDto[];
  /** Whether the caller has acknowledged the broadcast alert (null when no alert exists). */
  myAcknowledgedAt: string | null;
  additionalTriggerCount: number;
}

export interface CriticalAlertResultDto {
  emergency: EmergencyDto;
  /** true when this trigger was merged into an already-active critical alert. */
  coalesced: boolean;
  /** Honest status: the server queued the broadcast. It does not know whether devices received it. */
  broadcastStatus: 'QUEUED' | 'ALREADY_BROADCAST';
}

export interface AckSummaryDto {
  alertId: string;
  recipientCount: number;
  acknowledgedCount: number;
  notAcknowledgedCount: number;
  delivery: Partial<Record<DeliveryStatus, number>>;
}

export interface AckRecipientDto {
  userId: string;
  fullName: string;
  identificationValue: string | null;
  membershipStatus: MembershipStatus;
  acknowledgedAt: string | null;
  addedAfterBroadcast: boolean;
  /** Best-known push state across the recipient's devices; NOT proof of delivery. */
  pushState: DeliveryStatus | 'NO_DEVICE' | null;
}

export interface NotificationDto {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  body: string;
  communityId: string | null;
  emergencyId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface DeviceTokenDto {
  id: string;
  platform: DevicePlatform;
  provider: PushProviderName;
  lastSeenAt: string;
}

export interface DashboardOverviewDto {
  memberCount: number;
  pendingRequestCount: number;
  activeEmergencyCount: number;
  alertsToday: number;
  pendingReportCount: number;
}

export interface AuditLogDto {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actor: { id: string; fullName: string } | null;
  metadata: unknown;
  createdAt: string;
}

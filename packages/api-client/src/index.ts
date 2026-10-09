import type {
  AckRecipientDto,
  AckSummaryDto,
  ApiErrorBody,
  AuditLogDto,
  AuthResultDto,
  CommunityDto,
  CommunityPreviewDto,
  CommunityType,
  CriticalAlertResultDto,
  DashboardOverviewDto,
  DevicePlatform,
  DeviceTokenDto,
  EmergencyCategory,
  EmergencyDto,
  EmergencyEventDto,
  EmergencyPathway,
  EmergencyStatus,
  EmergencyUpdateDto,
  MemberListItemDto,
  MembershipDto,
  MembershipStatus,
  MyCommunityDto,
  NotificationDto,
  Paginated,
  PresignedUploadDto,
  PushProviderName,
  UserDto,
} from '@emcom/shared-types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** True when the request never reached the server (offline, DNS, timeout). */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

export interface ClientOptions {
  baseUrl: string;
  /** Returns the current access token (memory). */
  getAccessToken: () => string | null;
  /**
   * Obtains a fresh access token (e.g. rotate the stored refresh token, or call a cookie-based
   * session endpoint). Return null when the session is gone. Called at most once concurrently.
   */
  refresh: () => Promise<string | null>;
  onSessionExpired?: () => void;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

type Query = Record<string, string | number | boolean | undefined | null | string[]>;

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  idempotencyKey?: string;
  auth?: boolean;
  signal?: AbortSignal;
}

/** RFC4122 v4 id for Idempotency-Key headers (works in RN, browsers and Node). */
export function newIdempotencyKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function qs(query?: Query): string {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    p.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function createApiClient(opts: ClientOptions) {
  const f = opts.fetchImpl ?? fetch;
  let refreshing: Promise<string | null> | null = null;

  const refreshOnce = () => {
    refreshing ??= opts.refresh().finally(() => {
      refreshing = null;
    });
    return refreshing;
  };

  async function send<T>(method: string, path: string, o: RequestOptions = {}, retried = false): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (o.body !== undefined) headers['content-type'] = 'application/json';
    if (o.idempotencyKey) headers['idempotency-key'] = o.idempotencyKey;
    const token = o.auth === false ? null : opts.getAccessToken();
    if (token) headers.authorization = `Bearer ${token}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
    o.signal?.addEventListener('abort', () => controller.abort());
    let res: Response;
    try {
      res = await f(`${opts.baseUrl}${path}${qs(o.query)}`, {
        method,
        headers,
        body: o.body === undefined ? undefined : JSON.stringify(o.body),
        signal: controller.signal,
      });
    } catch (err) {
      throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach EMCOM. Check your connection.', String(err));
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401 && o.auth !== false && !retried) {
      const fresh = await refreshOnce().catch(() => null);
      if (fresh) return send<T>(method, path, o, true);
      opts.onSessionExpired?.();
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    const json = text ? (JSON.parse(text) as unknown) : undefined;
    if (!res.ok) {
      const e = (json as ApiErrorBody | undefined)?.error;
      throw new ApiError(res.status, e?.code ?? 'HTTP_ERROR', e?.message ?? `Request failed (${res.status})`, e?.details, e?.requestId);
    }
    return json as T;
  }

  const get = <T>(path: string, query?: Query) => send<T>('GET', path, { query });
  const post = <T>(path: string, body?: unknown, extra: Omit<RequestOptions, 'body'> = {}) => send<T>('POST', path, { ...extra, body: body ?? {} });
  const c = (communityId: string) => `/v1/communities/${communityId}`;

  return {
    raw: send,
    auth: {
      register: (b: { fullName: string; email: string; phone: string; password: string }) =>
        send<AuthResultDto>('POST', '/v1/auth/register', { body: b, auth: false }),
      login: (b: { email: string; password: string }) => send<AuthResultDto>('POST', '/v1/auth/login', { body: b, auth: false }),
      refresh: (refreshToken: string) => send<AuthResultDto>('POST', '/v1/auth/refresh', { body: { refreshToken }, auth: false }),
      logout: (refreshToken: string) => send<void>('POST', '/v1/auth/logout', { body: { refreshToken }, auth: false }),
      verifyEmail: (code: string) => post<UserDto>('/v1/auth/verify-email', { code }),
      resendVerification: () => post<void>('/v1/auth/resend-verification'),
      forgotPassword: (email: string) => send<void>('POST', '/v1/auth/password/forgot', { body: { email }, auth: false }),
      resetPassword: (b: { email: string; code: string; newPassword: string }) =>
        send<void>('POST', '/v1/auth/password/reset', { body: b, auth: false }),
    },
    me: {
      get: () => get<UserDto>('/v1/me'),
      update: (b: { fullName?: string; phone?: string }) => send<UserDto>('PATCH', '/v1/me', { body: b }),
      changePassword: (b: { currentPassword: string; newPassword: string }) => post<void>('/v1/me/password', b),
    },
    communities: {
      mine: () => get<MyCommunityDto[]>('/v1/communities/mine'),
      create: (b: {
        name: string;
        type: CommunityType;
        location: string;
        description?: string;
        identificationField?: { label: string; required: boolean };
        whatsappUrl?: string;
      }) => post<MyCommunityDto>('/v1/communities', b),
      preview: (code: string) => get<CommunityPreviewDto>('/v1/communities/preview', { code }),
      join: (b: { code: string; identificationValue?: string }) => post<MembershipDto>('/v1/communities/join', b),
      get: (id: string) => get<CommunityDto>(c(id)),
      update: (id: string, b: { name?: string; type?: CommunityType; location?: string; description?: string; whatsappUrl?: string | null }) =>
        send<CommunityDto>('PATCH', c(id), { body: b }),
      setIdentificationField: (id: string, field: { label: string; required: boolean } | null) =>
        send<CommunityDto>('PUT', `${c(id)}/identification-field`, { body: { field } }),
      rotateCode: (id: string) => post<CommunityDto>(`${c(id)}/invite-code/rotate`),
      myMembership: (id: string) => get<MembershipDto>(`${c(id)}/membership`),
      leave: (id: string) => post<MembershipDto>(`${c(id)}/leave`),
    },
    members: {
      list: (id: string, q: { status?: MembershipStatus; role?: string; q?: string; cursor?: string; limit?: number } = {}) =>
        get<Paginated<MemberListItemDto>>(`${c(id)}/members`, q),
      act: (id: string, membershipId: string, action: 'approve' | 'reject' | 'suspend' | 'reinstate' | 'remove') =>
        post<MemberListItemDto>(`${c(id)}/members/${membershipId}/${action}`),
      setRole: (id: string, membershipId: string, role: 'ADMIN' | 'MEMBER') =>
        post<MemberListItemDto>(`${c(id)}/members/${membershipId}/role`, { role }),
    },
    emergencies: {
      list: (id: string, q: { status?: EmergencyStatus[]; pathway?: EmergencyPathway; mine?: boolean; cursor?: string; limit?: number } = {}) =>
        get<Paginated<EmergencyDto>>(`${c(id)}/emergencies`, q),
      get: (id: string, emergencyId: string) => get<EmergencyDto>(`${c(id)}/emergencies/${emergencyId}`),
      report: (id: string, b: { category: EmergencyCategory; location: string; description: string; mediaIds?: string[] }, idempotencyKey: string) =>
        post<EmergencyDto>(`${c(id)}/emergencies`, b, { idempotencyKey }),
      triggerCritical: (id: string, idempotencyKey: string, b: { location?: string } = {}) =>
        post<CriticalAlertResultDto>(`${c(id)}/critical-alerts`, b, { idempotencyKey }),
      acknowledge: (id: string, emergencyId: string) =>
        post<{ acknowledgedAt: string; alreadyAcknowledged: boolean }>(`${c(id)}/emergencies/${emergencyId}/acknowledge`),
      updates: (id: string, emergencyId: string) => get<EmergencyUpdateDto[]>(`${c(id)}/emergencies/${emergencyId}/updates`),
      timeline: (id: string, emergencyId: string) => get<EmergencyEventDto[]>(`${c(id)}/emergencies/${emergencyId}/timeline`),
      confirm: (id: string, emergencyId: string, instructions?: string) =>
        post<EmergencyDto>(`${c(id)}/emergencies/${emergencyId}/confirm`, { instructions: instructions || undefined }),
      dismiss: (id: string, emergencyId: string, reason?: string) =>
        post<EmergencyDto>(`${c(id)}/emergencies/${emergencyId}/dismiss`, { reason: reason || undefined }),
      postUpdate: (id: string, emergencyId: string, message: string, idempotencyKey: string) =>
        post<EmergencyUpdateDto>(`${c(id)}/emergencies/${emergencyId}/updates`, { message }, { idempotencyKey }),
      resolve: (id: string, emergencyId: string, resolutionMessage: string) =>
        post<EmergencyDto>(`${c(id)}/emergencies/${emergencyId}/resolve`, { resolutionMessage }),
      ackSummary: (id: string, emergencyId: string) => get<AckSummaryDto>(`${c(id)}/emergencies/${emergencyId}/acknowledgments`),
      ackRecipients: (id: string, emergencyId: string, q: { filter?: 'acknowledged' | 'not_acknowledged'; q?: string; cursor?: string; limit?: number } = {}) =>
        get<Paginated<AckRecipientDto>>(`${c(id)}/emergencies/${emergencyId}/acknowledgments/recipients`, q),
    },
    media: {
      createUpload: (id: string, contentType: string, sizeBytes: number) =>
        post<PresignedUploadDto>(`${c(id)}/media/uploads`, { contentType, sizeBytes }),
      downloadUrl: (id: string, mediaId: string) => get<{ url: string; expiresAt: string }>(`${c(id)}/media/${mediaId}`),
    },
    notifications: {
      list: (q: { cursor?: string; limit?: number; communityId?: string; unreadOnly?: boolean } = {}) =>
        get<Paginated<NotificationDto>>('/v1/notifications', q),
      unreadCount: () => get<{ count: number }>('/v1/notifications/unread-count'),
      markRead: (id: string) => post<NotificationDto>(`/v1/notifications/${id}/read`),
      markAllRead: (communityId?: string) => send<{ updated: number }>('POST', '/v1/notifications/read-all', { query: { communityId }, body: {} }),
    },
    devices: {
      register: (b: { token: string; platform: DevicePlatform; provider: PushProviderName; appVersion?: string }) =>
        post<DeviceTokenDto>('/v1/devices', b),
      unregister: (token: string) => post<void>('/v1/devices/unregister', { token }),
      list: () => get<DeviceTokenDto[]>('/v1/devices'),
    },
    admin: {
      overview: (id: string, since?: string) => get<DashboardOverviewDto>(`${c(id)}/admin/overview`, { since }),
      auditLogs: (id: string, q: { action?: string; cursor?: string; limit?: number } = {}) =>
        get<Paginated<AuditLogDto>>(`${c(id)}/admin/audit-logs`, q),
    },
    dev: {
      mockPushes: () => get<MockPushRecord[]>('/v1/dev/mock-pushes'),
    },
  };
}

export interface MockPushRecord {
  deliveryId: string;
  status: string;
  attempts: number;
  queuedAt: string;
  acceptedAt: string | null;
  lastError: string | null;
  device: { platform: string; tokenSuffix: string };
  notification: { id: string; type: string; priority: string; title: string; body: string; communityId: string | null; emergencyId: string | null };
}

export type EmcomClient = ReturnType<typeof createApiClient>;

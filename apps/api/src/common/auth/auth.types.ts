import type { CommunityMembership } from '@prisma/client';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  emailVerified: boolean;
  sessionId: string;
}

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  typ: 'access';
}

export interface AuthedRequest {
  user: AuthUser;
  membership?: CommunityMembership;
  id?: string;
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
  params: Record<string, string>;
}

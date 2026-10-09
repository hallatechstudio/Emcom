import { $Enums } from '@prisma/client';
import * as Shared from '@emcom/shared-types';
import { decodeCursor, encodeCursor } from '../../src/common/http/pagination';
import { generateInviteCode } from '../../src/modules/communities/invite-code';
import { Content } from '../../src/modules/notifications/content';
import { setEnvForTests } from '../../src/config/env';
import { loadEnv } from '../../src/config/env';

describe('shared enums stay in sync with the Prisma schema', () => {
  const pairs: [string, Record<string, string>, Record<string, string>][] = [
    ['CommunityType', $Enums.CommunityType, Shared.CommunityType],
    ['MembershipRole', $Enums.MembershipRole, Shared.MembershipRole],
    ['MembershipStatus', $Enums.MembershipStatus, Shared.MembershipStatus],
    ['EmergencyPathway', $Enums.EmergencyPathway, Shared.EmergencyPathway],
    ['EmergencyStatus', $Enums.EmergencyStatus, Shared.EmergencyStatus],
    ['EmergencyCategory', $Enums.EmergencyCategory, Shared.EmergencyCategory],
    ['EmergencyEventType', $Enums.EmergencyEventType, Shared.EmergencyEventType],
    ['NotificationType', $Enums.NotificationType, Shared.NotificationType],
    ['DeliveryStatus', $Enums.DeliveryStatus, Shared.DeliveryStatus],
    ['PushProviderName', $Enums.PushProviderName, Shared.PushProviderName],
  ];
  it.each(pairs)('%s', (_name, prisma, shared) => {
    expect(Object.values(shared).sort()).toEqual(Object.values(prisma).sort());
  });
});

describe('emergency + membership state machines', () => {
  it('only allows documented emergency transitions', () => {
    const all = Object.values(Shared.EmergencyStatus);
    const allowed = all.flatMap((f) => all.filter((t) => Shared.canTransitionEmergency(f, t)).map((t) => `${f}->${t}`));
    expect(allowed.sort()).toEqual(['ACTIVE->RESOLVED', 'PENDING->ACTIVE', 'PENDING->DISMISSED']);
  });
  it('never lets a rejected/removed/left user become APPROVED without a new request', () => {
    for (const s of ['REJECTED', 'REMOVED', 'LEFT'] as const) {
      expect(Shared.canTransitionMembership(s, 'APPROVED')).toBe(false);
      expect(Shared.canTransitionMembership(s, 'PENDING')).toBe(true);
    }
  });
  it('role ranks', () => {
    expect(Shared.roleAtLeast('OWNER', 'ADMIN')).toBe(true);
    expect(Shared.roleAtLeast('MEMBER', 'ADMIN')).toBe(false);
    expect(Shared.canModerate('OWNER', 'OWNER')).toBe(false);
  });
});

describe('invite codes', () => {
  it('keeps a readable prefix and an unambiguous random suffix', () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateInviteCode('Jacob Mews')));
    expect(codes.size).toBe(500);
    for (const c of codes) expect(c).toMatch(/^JACOB[A-HJ-NP-Z2-9]{5}$/);
    expect(generateInviteCode('42 & Co')).toMatch(/^COX[A-Z2-9]{5}$/);
    expect(generateInviteCode('!!')).toMatch(/^XXX[A-Z2-9]{5}$/);
  });
});

describe('pagination cursors', () => {
  it('round-trips and rejects garbage', () => {
    const d = new Date('2026-10-09T10:00:00.000Z');
    expect(decodeCursor(encodeCursor(d, 'abc'))).toEqual({ createdAt: d, id: 'abc' });
    expect(decodeCursor('%%%')).toBeUndefined();
  });
});

describe('notification copy', () => {
  it('follows PRD wording and hides details when configured', () => {
    expect(Content.criticalAlert('Jacob Mews', null)).toMatchObject({
      type: 'CRITICAL_ALERT',
      priority: 'CRITICAL',
      title: 'EMERGENCY! Jacob Mews',
      body: 'A critical alert has been triggered for your community.',
    });
    setEnvForTests({ PUSH_INCLUDE_DETAILS: false });
    expect(Content.update('Jacob Mews', 'FIRE', 'secret text').body).toBe('Open EMCOM for details.');
    setEnvForTests({ PUSH_INCLUDE_DETAILS: true });
    expect(Content.update('Jacob Mews', 'FIRE', 'x'.repeat(500)).body.length).toBeLessThanOrEqual(160);
  });
});

describe('environment validation', () => {
  const base = { DATABASE_URL: 'postgresql://a:b@h:5432/d', REDIS_URL: 'redis://h:6379', JWT_ACCESS_SECRET: 'x'.repeat(40) };
  it('fails fast on short secrets', () => {
    expect(() => loadEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
  });
  it('refuses insecure production settings', () => {
    expect(() => loadEnv({ ...base, NODE_ENV: 'production', JWT_ACCESS_SECRET: 'change-me-' + 'x'.repeat(40) })).toThrow(/insecure/);
    expect(() => loadEnv({ ...base, NODE_ENV: 'production', PUSH_FORCE_MOCK: 'true' })).toThrow(/mock/);
    expect(loadEnv({ ...base, NODE_ENV: 'production' }).NODE_ENV).toBe('production');
  });
});

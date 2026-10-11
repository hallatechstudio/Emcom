import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { NotificationType, routeForNotification } from '@emcom/shared-types';

const APP = join(__dirname, '..', 'app');

/** Resolves a concrete URL path against the expo-router file tree (groups, [params], index). */
function resolves(path: string): boolean {
  const segments = path.split('/').filter(Boolean);
  const walk = (dir: string, rest: string[]): boolean => {
    const entries = readdirSync(dir, { withFileTypes: true });
    if (rest.length === 0) {
      if (entries.some((e) => e.isFile() && /^index\.tsx$/.test(e.name))) return true;
      return entries.some((e) => e.isDirectory() && /^\(.*\)$/.test(e.name) && walk(join(dir, e.name), rest));
    }
    const [head, ...tail] = rest;
    for (const e of entries) {
      const name = e.name.replace(/\.tsx$/, '');
      const matches = name === head || /^\[[^\]]+\]$/.test(name);
      if (e.isFile() && e.name.endsWith('.tsx') && tail.length === 0 && matches && name !== '_layout') return true;
      if (e.isDirectory() && matches && walk(join(dir, e.name), tail)) return true;
      if (e.isDirectory() && /^\(.*\)$/.test(e.name) && walk(join(dir, e.name), rest)) return true;
    }
    return false;
  };
  return walk(APP, segments);
}

describe('notification deep links (E2E 14)', () => {
  const c = '11111111-1111-4111-8111-111111111111';
  const e = '22222222-2222-4222-8222-222222222222';

  it.each(Object.values(NotificationType))('%s opens an existing screen in the right community', (type) => {
    const route = routeForNotification({ type, communityId: c, emergencyId: e, notificationId: 'n' });
    expect(resolves(route)).toBe(true);
    if (type.startsWith('EMERGENCY') || type === 'CRITICAL_ALERT') expect(route).toContain(`/c/${c}/`);
  });

  it('critical alerts and broadcasts open the Incoming Emergency Alert screen', () => {
    expect(routeForNotification({ type: 'CRITICAL_ALERT', communityId: c, emergencyId: e })).toBe(`/c/${c}/incoming/${e}`);
    expect(routeForNotification({ type: 'EMERGENCY_BROADCAST', communityId: c, emergencyId: e })).toBe(`/c/${c}/incoming/${e}`);
  });

  it('admin report notifications open the admin review screen', () => {
    expect(routeForNotification({ type: 'EMERGENCY_REPORT_RECEIVED', communityId: c, emergencyId: e })).toBe(`/c/${c}/admin/emergency/${e}`);
  });

  it('payloads without ids fall back to the inbox', () => {
    expect(routeForNotification({})).toBe('/notifications');
    expect(resolves('/notifications')).toBe(true);
  });

  it('every MVP member screen from the PRD exists', () => {
    for (const p of [
      'index.tsx', 'welcome.tsx', 'account.tsx', 'communities/scan.tsx', 'register.tsx', 'login.tsx', 'otp.tsx', 'communities/index.tsx', 'communities/create.tsx',
      'communities/join.tsx', 'communities/pending/[communityId].tsx', 'c/[communityId]/(tabs)/index.tsx', 'c/[communityId]/report.tsx',
      'c/[communityId]/report-submitted.tsx', 'c/[communityId]/critical.tsx', 'c/[communityId]/critical-confirm.tsx',
      'c/[communityId]/critical-sent/[emergencyId].tsx', 'c/[communityId]/incoming/[emergencyId].tsx',
      'c/[communityId]/emergency/[emergencyId]/index.tsx', 'c/[communityId]/emergency/[emergencyId]/updates.tsx',
      'c/[communityId]/emergency/[emergencyId]/timeline.tsx', 'c/[communityId]/(tabs)/history.tsx', 'c/[communityId]/(tabs)/profile.tsx',
      'c/[communityId]/admin/index.tsx', 'c/[communityId]/admin/emergency/[emergencyId].tsx', 'c/[communityId]/admin/members.tsx', 'c/[communityId]/admin/code.tsx',
    ]) {
      expect(existsSync(join(APP, p))).toBe(true);
    }
  });
});

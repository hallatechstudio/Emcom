import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canModerate,
  canTransitionEmergency,
  canTransitionMembership,
  isValidWhatsAppGroupUrl,
  normalizeCommunityCode,
  routeForNotification,
} from '../index';

test('emergency transitions', () => {
  assert.ok(canTransitionEmergency('PENDING', 'ACTIVE'));
  assert.ok(canTransitionEmergency('PENDING', 'DISMISSED'));
  assert.ok(canTransitionEmergency('ACTIVE', 'RESOLVED'));
  assert.ok(!canTransitionEmergency('DISMISSED', 'ACTIVE'));
  assert.ok(!canTransitionEmergency('RESOLVED', 'ACTIVE'));
  assert.ok(!canTransitionEmergency('PENDING', 'RESOLVED'));
});

test('membership transitions', () => {
  assert.ok(canTransitionMembership('PENDING', 'APPROVED'));
  assert.ok(canTransitionMembership('SUSPENDED', 'APPROVED'));
  assert.ok(!canTransitionMembership('REJECTED', 'APPROVED'));
  assert.ok(!canTransitionMembership('REMOVED', 'APPROVED'));
  assert.ok(canTransitionMembership('REMOVED', 'PENDING'));
});

test('moderation rank', () => {
  assert.ok(canModerate('OWNER', 'ADMIN'));
  assert.ok(canModerate('ADMIN', 'MEMBER'));
  assert.ok(!canModerate('ADMIN', 'ADMIN'));
  assert.ok(!canModerate('ADMIN', 'OWNER'));
});

test('whatsapp url validation', () => {
  assert.ok(isValidWhatsAppGroupUrl('https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQr'));
  assert.ok(!isValidWhatsAppGroupUrl('http://chat.whatsapp.com/AbCdEfGhIjKlMnOpQr'));
  assert.ok(!isValidWhatsAppGroupUrl('https://chat.whatsapp.com.evil.com/AbCdEfGhIjKl'));
  assert.ok(!isValidWhatsAppGroupUrl('javascript:alert(1)'));
  assert.ok(!isValidWhatsAppGroupUrl('https://user@chat.whatsapp.com/AbCdEfGhIjKl'));
});

test('code normalisation', () => {
  assert.equal(normalizeCommunityCode(' jacob-4821 '), 'JACOB4821');
});

test('notification routing', () => {
  assert.equal(
    routeForNotification({ type: 'CRITICAL_ALERT', communityId: 'c1', emergencyId: 'e1' }),
    '/c/c1/incoming/e1',
  );
  assert.equal(
    routeForNotification({ type: 'EMERGENCY_UPDATE', communityId: 'c1', emergencyId: 'e1' }),
    '/c/c1/emergency/e1',
  );
  assert.equal(routeForNotification({}), '/notifications');
});

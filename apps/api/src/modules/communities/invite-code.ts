import { randomInt } from 'crypto';

// No I, O, 0, 1 — avoids misreading when codes are shared verbally or on paper.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * PRD §8 example: JACOB4821. We keep the readable name prefix (≤5 letters) and append 5 random
 * characters (32^5 ≈ 33M combinations per prefix) so codes are not practical to guess.
 */
export function generateInviteCode(communityName: string): string {
  const prefix = communityName
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 5)
    .padEnd(3, 'X');
  let suffix = '';
  for (let i = 0; i < 5; i++) suffix += ALPHABET[randomInt(0, ALPHABET.length)];
  return prefix + suffix;
}

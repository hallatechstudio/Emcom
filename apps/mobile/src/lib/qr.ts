import { COMMUNITY_CODE_PATTERN, normalizeCommunityCode } from '@emcom/shared-types';

/** Accepts the admin QR (emcom://communities/join?code=…) or a bare community code. */
export function codeFromQr(data: string): string | null {
  let candidate = data.trim();
  const m = candidate.match(/[?&]code=([A-Za-z0-9-]+)/);
  if (m) candidate = m[1]!;
  const code = normalizeCommunityCode(candidate);
  return COMMUNITY_CODE_PATTERN.test(code) ? code : null;
}

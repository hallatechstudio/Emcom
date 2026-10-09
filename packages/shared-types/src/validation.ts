/** Shared input limits so clients and server agree. */
export const Limits = {
  fullName: { min: 2, max: 100 },
  password: { min: 10, max: 128 },
  communityName: { min: 2, max: 80 },
  location: { min: 2, max: 160 },
  description: { max: 2000 },
  emergencyDescription: { min: 3, max: 2000 },
  identificationLabel: { min: 2, max: 40 },
  identificationValue: { max: 60 },
  updateMessage: { min: 2, max: 1000 },
  resolutionMessage: { min: 5, max: 1000 },
  dismissalReason: { max: 500 },
  maxPhotoBytes: 10 * 1024 * 1024,
  maxVideoBytes: 50 * 1024 * 1024,
  maxMediaPerReport: 4,
} as const;

export const ALLOWED_MEDIA_TYPES = {
  'image/jpeg': 'PHOTO',
  'image/png': 'PHOTO',
  'image/heic': 'PHOTO',
  'image/webp': 'PHOTO',
  'video/mp4': 'VIDEO',
  'video/quicktime': 'VIDEO',
} as const;
export type AllowedMediaType = keyof typeof ALLOWED_MEDIA_TYPES;

/** Accepts only https links to WhatsApp group invites (chat.whatsapp.com/<code>). */
export function isValidWhatsAppGroupUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    url.hostname === 'chat.whatsapp.com' &&
    url.username === '' &&
    url.password === '' &&
    url.port === '' &&
    /^\/[A-Za-z0-9]{10,40}\/?$/.test(url.pathname)
  );
}

/** Community codes: uppercase letters + digits, e.g. JACOB4821 (PRD §8). */
export const COMMUNITY_CODE_PATTERN = /^[A-Z0-9]{6,12}$/;

export function normalizeCommunityCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}

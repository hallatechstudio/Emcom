/** High-contrast palette. Emergency red meets WCAG AA for white text (5.9:1). */
export const colors = {
  emergency: '#C8102E',
  emergencyDark: '#9B0C23',
  emergencySoft: '#FDECEE',
  critical: '#7A0019',
  safe: '#15803D',
  safeSoft: '#E8F6EC',
  caution: '#B45309',
  cautionSoft: '#FEF3C7',
  ink: '#111827',
  inkMuted: '#4B5563',
  line: '#D1D5DB',
  surface: '#FFFFFF',
  background: '#F3F4F6',
  primary: '#172554',
  whatsapp: '#128C3B',
};

export const space = (n: number) => n * 4;
export const radius = { sm: 8, md: 12, lg: 18, pill: 999 };
/** Minimum touch target (WCAG 2.5.5 / platform guidance). */
export const TOUCH = 48;

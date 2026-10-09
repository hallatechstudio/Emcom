import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { EmergencyCategoryLabel, type EmergencyDto } from '@emcom/shared-types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const dt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const t = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

export const formatDateTime = (iso: string | null | undefined) => (iso ? dt.format(new Date(iso)) : '—');
export const formatTime = (iso: string | null | undefined) => (iso ? t.format(new Date(iso)) : '—');

export function emergencyTitle(e: Pick<EmergencyDto, 'pathway' | 'category'>): string {
  if (e.pathway === 'CRITICAL') return 'Critical Alert';
  return e.category ? `${EmergencyCategoryLabel[e.category]} Emergency` : 'Emergency';
}

/** Start of the viewer's local day, for "Alerts Today". */
export function startOfLocalDayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

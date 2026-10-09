import { EmergencyCategoryLabel, type EmergencyDto } from '@emcom/shared-types';

export const time = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '—');
export const dateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—';

export function titleOf(e: Pick<EmergencyDto, 'pathway' | 'category'>): string {
  if (e.pathway === 'CRITICAL') return 'CRITICAL ALERT';
  return e.category ? `${EmergencyCategoryLabel[e.category].toUpperCase()} EMERGENCY` : 'EMERGENCY';
}

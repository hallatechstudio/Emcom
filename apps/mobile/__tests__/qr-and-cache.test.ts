import type { Query } from '@tanstack/react-query';
import { codeFromQr } from '@/lib/qr';
import { shouldPersistQuery } from '@/lib/query-cache';

describe('community QR parsing', () => {
  it('reads codes from the admin QR deep link, plain codes and dashed/lowercase input', () => {
    expect(codeFromQr('emcom://communities/join?code=JACOB7KQ2M')).toBe('JACOB7KQ2M');
    expect(codeFromQr('JACOB4821')).toBe('JACOB4821');
    expect(codeFromQr(' jacob-4821 ')).toBe('JACOB4821');
  });
  it('rejects anything that is not a community code', () => {
    expect(codeFromQr('https://evil.example/phish')).toBeNull();
    expect(codeFromQr('emcom://communities/join?code=<script>')).toBeNull();
    expect(codeFromQr('')).toBeNull();
  });
});

describe('offline cache selection', () => {
  const q = (queryKey: unknown[], status: 'success' | 'error' = 'success') => ({ queryKey, state: { status } }) as unknown as Query;
  it('saves communities, active emergencies and incident details only', () => {
    expect(shouldPersistQuery(q(['mine']))).toBe(true);
    expect(shouldPersistQuery(q(['c', 'c1', 'emergencies', 'ACTIVE']))).toBe(true);
    expect(shouldPersistQuery(q(['c', 'c1', 'emergency', 'e1']))).toBe(true);
    expect(shouldPersistQuery(q(['c', 'c1', 'emergency', 'e1', 'acks']))).toBe(false);
    expect(shouldPersistQuery(q(['c', 'c1', 'members', 'PENDING', '']))).toBe(false);
    expect(shouldPersistQuery(q(['inbox', 'list']))).toBe(false);
    expect(shouldPersistQuery(q(['mine'], 'error'))).toBe(false);
  });
});

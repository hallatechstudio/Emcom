import { describe, expect, it } from 'vitest';
import { emergencyTitle, startOfLocalDayIso } from './utils';

describe('utils', () => {
  it('titles emergencies by pathway and category', () => {
    expect(emergencyTitle({ pathway: 'CRITICAL', category: null })).toBe('Critical Alert');
    expect(emergencyTitle({ pathway: 'NORMAL', category: 'GAS_LEAK' })).toBe('Gas Leak Emergency');
  });
  it('computes local midnight', () => {
    const d = new Date(startOfLocalDayIso());
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });
});

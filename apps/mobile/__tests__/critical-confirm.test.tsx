import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ApiError } from '@emcom/api-client';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ communityId: 'c-1' }),
}));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Heavy: 'heavy' } }));
jest.mock('@/hooks/queries', () => ({ useCommunity: () => ({ community: { name: 'Jacob Mews' } }) }));
const mockTrigger = jest.fn();
jest.mock('@/lib/api', () => ({
  api: { emergencies: { triggerCritical: (...a: unknown[]) => mockTrigger(...a) } },
  messageOf: (e: Error) => e.message,
}));

import { router as mockRouter } from 'expo-router';
import CriticalConfirm from '../app/c/[communityId]/critical-confirm';

beforeEach(() => jest.clearAllMocks());

describe('Critical Alert confirmation (E2E 5, 6, 9)', () => {
  it('names the selected community explicitly', () => {
    render(<CriticalConfirm />);
    expect(screen.getByTestId('confirm-community').props.children).toBe('Jacob Mews');
    expect(screen.getByText('Are you sure you want to send a Critical Alert?')).toBeTruthy();
  });

  it('NO, CANCEL makes no request', () => {
    render(<CriticalConfirm />);
    fireEvent.press(screen.getByTestId('confirm-no'));
    expect(mockRouter.back).toHaveBeenCalled();
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it('YES sends once even when tapped repeatedly, then shows the sent screen', async () => {
    let resolve!: (v: unknown) => void;
    mockTrigger.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<CriticalConfirm />);
    fireEvent.press(screen.getByTestId('confirm-yes'));
    fireEvent.press(screen.getByTestId('confirm-yes'));
    fireEvent.press(screen.getByTestId('confirm-yes'));
    expect(mockTrigger).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ emergency: { id: 'e-9' }, coalesced: false, broadcastStatus: 'QUEUED' }));
    expect(mockRouter.replace).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ emergencyId: 'e-9', coalesced: '0' }) }));
  });

  it('a network failure says NOT SENT and the retry reuses the same idempotency key', async () => {
    mockTrigger.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'offline'));
    mockTrigger.mockResolvedValueOnce({ emergency: { id: 'e-1' }, coalesced: false, broadcastStatus: 'QUEUED' });
    render(<CriticalConfirm />);
    fireEvent.press(screen.getByTestId('confirm-yes'));
    await waitFor(() => expect(screen.getByText(/NOT SENT — no connection/)).toBeTruthy());
    fireEvent.press(screen.getByTestId('confirm-yes'));
    await waitFor(() => expect(mockTrigger).toHaveBeenCalledTimes(2));
    const [c1, key1] = mockTrigger.mock.calls[0];
    const [c2, key2] = mockTrigger.mock.calls[1];
    expect(c1).toBe('c-1');
    expect(c2).toBe('c-1');
    expect(key1).toBe(key2);
  });
});

import { Vibration } from 'react-native';
import { isAlarmRinging, startAlarm, stopAlarm } from '@/lib/alarm';

describe('in-app alarm', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    stopAlarm();
    jest.useRealTimers();
  });

  it('loops sound + vibration until silenced', async () => {
    const vib = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => undefined);
    const cancel = jest.spyOn(Vibration, 'cancel').mockImplementation(() => undefined);
    await startAlarm();
    expect(isAlarmRinging()).toBe(true);
    expect(vib).toHaveBeenCalledWith(expect.any(Array), true);
    stopAlarm();
    expect(isAlarmRinging()).toBe(false);
    expect(cancel).toHaveBeenCalled();
  });

  it('stops on its own after 30 seconds', async () => {
    jest.spyOn(Vibration, 'vibrate').mockImplementation(() => undefined);
    await startAlarm();
    jest.advanceTimersByTime(30_000);
    expect(isAlarmRinging()).toBe(false);
  });
});

import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Vibration } from 'react-native';

/**
 * In-app emergency alarm, used only while EMCOM is open in the foreground and an ACTIVE emergency
 * the user has not acknowledged is on screen. Loops a siren + vibration until silenced, acknowledged,
 * or MAX_SECONDS elapse. Background/locked-phone alerting is the OS push notification's job.
 */
const MAX_SECONDS = 30;
const VIBRATION = [0, 700, 400, 700, 400];

let player: AudioPlayer | null = null;
let stopTimer: ReturnType<typeof setTimeout> | null = null;
let ringing = false;

export async function startAlarm(): Promise<void> {
  if (ringing) return;
  ringing = true;
  try {
    // The user is looking at an emergency inside the app; play even if the ringer switch is off.
    await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'duckOthers' });
    player ??= createAudioPlayer(require('../../assets/sounds/emergency-alarm.wav'));
    player.loop = true;
    player.volume = 1;
    await player.seekTo(0);
    player.play();
  } catch {
    // Audio can fail (e.g. another app holds the session); vibration still runs.
  }
  Vibration.vibrate(VIBRATION, true);
  stopTimer = setTimeout(() => stopAlarm(), MAX_SECONDS * 1000);
}

export function stopAlarm(): void {
  if (stopTimer) clearTimeout(stopTimer);
  stopTimer = null;
  ringing = false;
  Vibration.cancel();
  try {
    player?.pause();
  } catch {
    // ignore
  }
}

export const isAlarmRinging = () => ringing;

import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import type { UserDto } from '@emcom/shared-types';

const REFRESH_KEY = 'emcom.refreshToken';
const USER_KEY = 'emcom.user';

/**
 * Session state. The refresh token is kept only in the OS keystore (expo-secure-store);
 * the access token lives in memory.
 */
interface SessionState {
  ready: boolean;
  user: UserDto | null;
  accessToken: string | null;
  /** Route requested by a notification tap before the user was signed in. */
  pendingRoute: string | null;
  hydrate: () => Promise<string | null>;
  setSession: (user: UserDto, accessToken: string, refreshToken: string) => Promise<void>;
  setAccessToken: (t: string | null) => void;
  setUser: (u: UserDto) => void;
  clear: () => Promise<void>;
  setPendingRoute: (r: string | null) => void;
}

export const useSession = create<SessionState>((set) => ({
  ready: false,
  user: null,
  accessToken: null,
  pendingRoute: null,
  hydrate: async () => {
    const [refresh, user] = await Promise.all([SecureStore.getItemAsync(REFRESH_KEY), SecureStore.getItemAsync(USER_KEY)]);
    set({ user: user ? (JSON.parse(user) as UserDto) : null });
    return refresh;
  },
  setSession: async (user, accessToken, refreshToken) => {
    await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    set({ user, accessToken, ready: true });
  },
  setAccessToken: (accessToken) => set({ accessToken }),
  setUser: (user) => {
    void SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    set({ user });
  },
  clear: async () => {
    await SecureStore.deleteItemAsync(REFRESH_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
    set({ user: null, accessToken: null, ready: true });
  },
  setPendingRoute: (pendingRoute) => set({ pendingRoute }),
}));

export const getStoredRefreshToken = () => SecureStore.getItemAsync(REFRESH_KEY);
export const storeRefreshToken = (t: string) => SecureStore.setItemAsync(REFRESH_KEY, t);

jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    getItemAsync: jest.fn(async (k) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k, v) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k) => void store.delete(k)),
  };
});
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => () => undefined),
  fetch: jest.fn(async () => ({ isConnected: true })),
  useNetInfo: () => ({ isConnected: true, isInternetReachable: true }),
}));

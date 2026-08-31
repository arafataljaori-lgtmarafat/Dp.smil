import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const SESSION_TOKEN_KEY = 'dentpilot.session-token.v1';

export interface SecureSessionStore {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  clear(): Promise<void>;
}

/** Native-only durable session storage. */
export const secureSessionStore: SecureSessionStore = {
  get: () => SecureStore.getItemAsync(SESSION_TOKEN_KEY),
  set: (token) => SecureStore.setItemAsync(SESSION_TOKEN_KEY, token),
  clear: () => SecureStore.deleteItemAsync(SESSION_TOKEN_KEY),
};

/** Web deliberately retains a session only for the lifetime of the current page. */
export function createInMemorySessionStore(): SecureSessionStore {
  let token: string | null = null;
  return {
    get: () => Promise.resolve(token),
    set: (nextToken: string) => {
      token = nextToken;
      return Promise.resolve();
    },
    clear: () => {
      token = null;
      return Promise.resolve();
    },
  };
}

export const webSessionStore = createInMemorySessionStore();
export const platformSessionStore: SecureSessionStore = Platform.OS === 'web' ? webSessionStore : secureSessionStore;

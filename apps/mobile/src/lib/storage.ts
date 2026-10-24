import * as SecureStore from "expo-secure-store";
import Storage from "expo-sqlite/kv-store";
import type { KeyValueStorage } from "@will-be-done/client/sync";

export const appStorage: KeyValueStorage = {
  getItem: (key) => Storage.getItemSync(key),
  setItem: (key, value) => Storage.setItemSync(key, value),
  removeItem: (key) => {
    Storage.removeItemSync(key);
  },
};

// Keychain/Keystore-backed storage for secrets. SecureStore deletes only
// asynchronously, so reads go through a cache that reflects writes at once.
const secureCache = new Map<string, string | null>();

export const secureStorage: KeyValueStorage = {
  getItem: (key) => {
    if (!secureCache.has(key)) secureCache.set(key, SecureStore.getItem(key));
    return secureCache.get(key) ?? null;
  },
  setItem: (key, value) => {
    secureCache.set(key, value);
    SecureStore.setItem(key, value);
  },
  removeItem: (key) => {
    secureCache.set(key, null);
    void SecureStore.deleteItemAsync(key);
  },
};

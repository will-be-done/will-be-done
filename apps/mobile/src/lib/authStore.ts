import { createAuthStore } from "@will-be-done/client/auth";
import { appStorage, secureStorage } from "./storage";

export const authStore = createAuthStore({
  storage: appStorage,
  tokenStorage: secureStorage,
});

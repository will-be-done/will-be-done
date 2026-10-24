import { resetWsClient } from "./trpc";
import { queryClient } from "./query";
import { resetWebAnalytics } from "./analytics";
import { webStorage } from "./webStorage";
import { createAuthStore } from "@will-be-done/client/auth";

const authStore = createAuthStore({ storage: webStorage });

export const authUtils = {
  ...authStore,
  signOut: (): void => {
    resetWebAnalytics();
    authStore.clearSession();
    queryClient.clear();
    // Reset WebSocket to force reconnection with new auth state
    resetWsClient();
  },
};

export const isDemoMode = () =>
  typeof window !== "undefined" &&
  window.location.hostname === "demo.will-be-done.app";

import { useSyncExternalStore } from "react";
import { authStore } from "./authStore";
import { queryClient } from "./query";
import { resetWsClient } from "./trpc";

export const authUtils = {
  ...authStore,
  signIn: ({ token, userId }: { token: string; userId: string }) => {
    queryClient.clear();
    authStore.setToken(token);
    authStore.setUserId(userId);
    resetWsClient();
  },
  signOut: (): void => {
    authStore.clearSession();
    queryClient.clear();
    resetWsClient();
  },
};

export const useAuthSnapshot = () =>
  useSyncExternalStore(authUtils.subscribe, authUtils.getSnapshot);

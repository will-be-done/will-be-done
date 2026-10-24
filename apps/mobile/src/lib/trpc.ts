import { AppState } from "react-native";
import {
  createTRPCClient,
  createWSClient,
  httpBatchLink,
  splitLink,
  wsLink,
} from "@trpc/client";
import type { AppRouter } from "@will-be-done/api";
import { API_URL, WS_URL } from "./config";
import { authStore } from "./authStore";

const getToken = () => authStore.getToken();

const wsClient = createWSClient({
  url: () => {
    const token = getToken();
    const url = `${WS_URL}/api/trpc`;
    return token ? `${url}?token=${encodeURIComponent(token)}` : url;
  },
  keepAlive: { enabled: true },
});

// Forces a reconnect, e.g. after sign-in/out or when the app returns to the
// foreground with a connection the OS may have silently dropped.
export function resetWsClient(): void {
  void wsClient.close();
}

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === "subscription",
      true: wsLink<AppRouter>({ client: wsClient }),
      false: httpBatchLink({
        url: `${API_URL}/api/trpc`,
        headers: () => {
          const token = getToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    }),
  ],
});

// Mobile OSes drop sockets of backgrounded apps without a close event.
AppState.addEventListener("change", (state) => {
  if (state === "active") resetWsClient();
});

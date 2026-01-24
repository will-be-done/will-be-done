import {
  createTRPCClient,
  httpBatchLink,
  splitLink,
  createWSClient,
  wsLink,
} from "@trpc/client";
import {
  createTRPCContext,
  createTRPCOptionsProxy,
} from "@trpc/tanstack-react-query";
import { AppRouter } from "@will-be-done/api";
import { authUtils } from "./auth";
import { queryClient } from "./query";

// Create WebSocket URL with auth token
function getWsUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  const token = authUtils.getToken();
  const baseUrl = `${protocol}//${host}/api/trpc`;

  // Pass token as query parameter for WebSocket auth
  return token ? `${baseUrl}?token=${encodeURIComponent(token)}` : baseUrl;
}

// WebSocket client - uses URL function for dynamic auth token
// The URL function is called on each connection/reconnection
const wsClient = createWSClient({
  url: getWsUrl,
  keepAlive: {
    enabled: true,
  },
});

document.addEventListener("visibilitychange", () => {
  // Let's reconnect on visibility change,
  // Cause, for example, iOS safari connection may hang
  // https://github.com/trpc/trpc/issues/4078
  if (document.visibilityState === "visible") {
    wsClient?.connection?.ws?.dispatchEvent(new CloseEvent("close"));
  }
});

// Reset WebSocket client (e.g., on logout/login)
export function resetWsClient(): void {
  // Close and let it reconnect with new auth token
  void wsClient.close();
}

// Vanilla tRPC client for background sync in load.ts
export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      // Route subscriptions to WebSocket, everything else to HTTP
      condition: (op) => op.type === "subscription",
      true: wsLink<AppRouter>({
        client: wsClient,
      }),
      false: httpBatchLink({
        url: "/api/trpc",
        headers: () => {
          const token = authUtils.getToken();
          return token
            ? {
                Authorization: `Bearer ${token}`,
              }
            : {};
        },
      }),
    }),
  ],
});

// TanStack React Query integration for component usage
export const { TRPCProvider, useTRPC, useTRPCClient } =
  createTRPCContext<AppRouter>();

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});

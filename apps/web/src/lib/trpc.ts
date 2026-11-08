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
import type { AppRouter } from "@will-be-done/api";
import { authUtils } from "./auth";
import { isDemoMode } from "./demoMode";
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
  // The demo never subscribes, so it must not try to reach a server.
  lazy: { enabled: isDemoMode(), closeMs: 0 },
});

// Drops the current socket so the client reconnects with a fresh URL and
// resends live subscriptions. The synthetic close event makes that happen at
// once instead of after the close handshake, which can hang on iOS.
export function reconnectWsClient(): void {
  const ws = wsClient.connection?.ws;
  if (!ws) return;
  ws.dispatchEvent(new CloseEvent("close"));
  // The client already reconnected; the real close must not do it again.
  ws.addEventListener("close", (event) => event.stopImmediatePropagation(), {
    capture: true,
    once: true,
  });
  ws.close();
}

document.addEventListener("visibilitychange", () => {
  // Let's reconnect on visibility change,
  // Cause, for example, iOS safari connection may hang
  // https://github.com/trpc/trpc/issues/4078
  if (document.visibilityState === "visible") reconnectWsClient();
});

// Closes the client on logout; the next subscription reopens it.
export function resetWsClient(): void {
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

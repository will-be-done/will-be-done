import { createTRPCClient, httpBatchLink } from "@trpc/client";
import {
  createTRPCContext,
  createTRPCOptionsProxy,
} from "@trpc/tanstack-react-query";
import { AppRouter } from "@will-be-done/api";
import { authUtils } from "./auth";
import { queryClient } from "./query";

// Vanilla tRPC client for background sync in load.ts
export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
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
  ],
});

// TanStack React Query integration for component usage
export const { TRPCProvider, useTRPC, useTRPCClient } =
  createTRPCContext<AppRouter>();

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});

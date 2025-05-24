import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@will-be-done/api";

export const makeClient = () => {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: "/api/trpc",
      }),
    ],
  });
};

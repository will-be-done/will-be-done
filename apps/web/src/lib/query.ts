import { QueryClient } from "@tanstack/react-query";

// Singleton QueryClient for the entire app
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
    },
  },
});

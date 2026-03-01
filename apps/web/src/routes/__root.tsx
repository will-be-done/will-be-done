import { HeadContent, Outlet, createRootRoute } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { TRPCProvider, trpcClient } from "@/lib/trpc";
import { queryClient } from "@/lib/query";

export const Route = createRootRoute({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <HeadContent />
        <Outlet />

        {/* <TanStackRouterDevtools position="bottom-right" /> */}
      </TRPCProvider>
    </QueryClientProvider>
  );
}

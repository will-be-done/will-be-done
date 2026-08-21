import {
  HeadContent,
  Outlet,
  createRootRoute,
  useRouterState,
} from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { TRPCProvider, trpcClient } from "@/lib/trpc";
import { queryClient } from "@/lib/query";
import { PromptDialogHost } from "@/components/ui/prompt-dialog";
import { HyperDBDevtools } from "@will-be-done/hyperdb-devtool/react";
import { useDevtoolsEnabled } from "@/lib/devtools";
import { Toaster } from "@/components/ui/sonner";
import { PwaUpdateController } from "@/components/PwaUpdateController";
import { ThemeProvider } from "@/components/ui/theme-provider";

export const Route = createRootRoute({
  component: RouteComponent,
});

function RouteComponent() {
  const isPopup = useRouterState({
    select: (state) => state.location.pathname === "/popup",
  });

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
          <HeadContent />
          {isPopup ? <PopupRoot /> : <ApplicationRoot />}
        </ThemeProvider>
      </TRPCProvider>
    </QueryClientProvider>
  );
}

function PopupRoot() {
  return <Outlet />;
}

function ApplicationRoot() {
  const devtoolsEnabled = useDevtoolsEnabled();

  return (
    <>
      <Outlet />
      <PwaUpdateController />
      <Toaster />
      <PromptDialogHost />
      {devtoolsEnabled && (
        <HyperDBDevtools
          position="bottom"
          buttonPosition="bottom-right"
          maxTraces={1000}
        />
      )}

      {/* <TanStackRouterDevtools position="bottom-right" /> */}
    </>
  );
}

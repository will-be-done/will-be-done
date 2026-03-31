import { GlobalListener } from "@/components/GlobalListener/GlobalListener.tsx";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { KeyPressedCtxProvider } from "@/components/GlobalListener/KeyPressedCtxProvider.tsx";
import { Outlet, redirect, createFileRoute, useRouterState } from "@tanstack/react-router";
import { CardDetails } from "@/components/CardDetails/CardDetails.tsx";
import { DBProvider } from "@will-be-done/hyperdb";
import { initDbStore } from "@/store/load.ts";
import { authUtils, isDemoMode } from "@/lib/auth";
import { demoSpaceDBConfig, spaceDBConfig } from "@/store/configs";
import { useFocusStore } from "@/store/focusSlice.ts";
import { useEffect } from "react";

export const Route = createFileRoute("/spaces/$spaceId")({
  component: RouteComponent,
  loader: async (opts) => {
    if (!isDemoMode() && !authUtils.isAuthenticated()) {
      throw redirect({ to: "/login" });
    }

    if (!isDemoMode()) {
      authUtils.setLastUsedSpaceId(opts.params.spaceId);
    }

    const config = isDemoMode()
      ? demoSpaceDBConfig()
      : spaceDBConfig(opts.params.spaceId);

    return initDbStore(config);
  },
});

function RouteComponent() {
  const newStore = Route.useLoaderData();

  return (
    <DBProvider value={newStore}>
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <KeyPressedCtxProvider>
          <div className="relative h-full">
            <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-10 [app-region:drag]" />

            <GlobalListener />
            <ResetFocusOnNavigate />

            <Outlet />
            <CardDetails />
          </div>
        </KeyPressedCtxProvider>
      </ThemeProvider>
    </DBProvider>
  );
}

function ResetFocusOnNavigate() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    useFocusStore.getState().resetFocus();
  }, [pathname]);

  return null;
}

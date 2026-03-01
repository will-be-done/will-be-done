import { GlobalListener } from "@/components/GlobalListener/GlobalListener.tsx";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { KeyPressedCtxProvider } from "@/components/GlobalListener/KeyPressedCtxProvider.tsx";
import { Outlet, redirect, createFileRoute, useRouterState } from "@tanstack/react-router";
import { DBProvider, useDispatch } from "@will-be-done/hyperdb";
import { initDbStore } from "@/store/load.ts";
import { authUtils, isDemoMode } from "@/lib/auth";
import { demoSpaceDBConfig, spaceDBConfig } from "@/store/configs";
import { focusSlice } from "@/store/focusSlice.ts";
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
    <>
      <DBProvider value={newStore}>
        <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
          <KeyPressedCtxProvider>
            <GlobalListener />
            <ResetFocusOnNavigate />

            <Outlet />
          </KeyPressedCtxProvider>
        </ThemeProvider>
      </DBProvider>
    </>
  );
}

function ResetFocusOnNavigate() {
  const dispatch = useDispatch();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    dispatch(focusSlice.resetFocus());
  }, [pathname]);

  return null;
}

import { GlobalListener } from "@/components/GlobalListener/GlobalListener.tsx";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { KeyPressedCtxProvider } from "@/components/GlobalListener/KeyPressedCtxProvider.tsx";
import { Outlet, redirect, createFileRoute } from "@tanstack/react-router";
import { DBProvider } from "@will-be-done/hyperdb";
import { initDbStore } from "@/store/load.ts";
import { authUtils, isDemoMode } from "@/lib/auth";
import { demoSpaceDBConfig, spaceDBConfig } from "@/store/configs";

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

            <Outlet />
          </KeyPressedCtxProvider>
        </ThemeProvider>
      </DBProvider>
    </>
  );
}

import { GlobalListener } from "@/components/GlobalListener/GlobalListener.tsx";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { KeyPressedCtxProvider } from "@/components/GlobalListener/KeyPressedCtxProvider.tsx";
import { Outlet, redirect, createFileRoute } from "@tanstack/react-router";
import { DBProvider } from "@will-be-done/hyperdb";
import { initDbStore } from "@/store/load.ts";
import { authUtils } from "@/lib/auth";

export const Route = createFileRoute("/spaces/$spaceId")({
  component: RouteComponent,
  loader: async (opts) => {
    if (!authUtils.isAuthenticated()) {
      throw redirect({ to: "/login" });
    }

    authUtils.setLastUsedSpaceId(opts.params.spaceId);

    return initDbStore(opts.params.spaceId);
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

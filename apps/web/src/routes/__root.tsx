import { GlobalListener } from "@/components/GlobalListener/GlobalListener.tsx";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { KeyPressedCtxProvider } from "@/components/GlobalListener/KeyPressedCtxProvider.tsx";
import { Outlet, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { DBProvider } from "@will-be-done/hyperdb";
import { initDbStore } from "@/store/load.ts";

export const Route = createRootRoute({
  component: RouteComponent,
  loader: async () => {
    return initDbStore();
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

            <TanStackRouterDevtools />
          </KeyPressedCtxProvider>
        </ThemeProvider>
      </DBProvider>
    </>
  );
}

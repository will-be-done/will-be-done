import { GlobalListener } from "@/features/global-listener/components/GlobalListener.tsx";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { KeyPressedCtxProvider } from "@/features/global-listener/components/KeyPressedCtxProvider.tsx";
import { initStore } from "@/store/store.ts";
import { Outlet, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { StoreProvider } from "@will-be-done/hyperstate";
import "@/store/z.hot.ts";
import { initDbStore } from "@/store2/slices/load";
import { DBProvider } from "@will-be-done/hyperdb";

export const Route = createRootRoute({
  component: RouteComponent,
  loader: async () => {
    return {
      oldStore: await initStore(),
      newStore: await initDbStore(),
    };
  },
});

function RouteComponent() {
  const oldStore = Route.useLoaderData().oldStore;
  const newStore = Route.useLoaderData().newStore;

  return (
    <>
      <DBProvider value={newStore}>
        <StoreProvider value={oldStore}>
          <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
            <KeyPressedCtxProvider>
              <GlobalListener />

              <Outlet />

              <TanStackRouterDevtools />
            </KeyPressedCtxProvider>
          </ThemeProvider>
        </StoreProvider>
      </DBProvider>
    </>
  );
}

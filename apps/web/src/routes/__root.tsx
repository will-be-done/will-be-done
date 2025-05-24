import { GlobalListener } from "@/components/GlobalListener/GlobalListener";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { KeyPressedCtxProvider } from "@/globalListener/KeyPressedCtxProvider";
import { initStore } from "@/models/initRootStore2";
import { Outlet, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { StoreProvider } from "@will-be-done/hyperstate";

export const Route = createRootRoute({
  component: RouteComponent,
  loader: () => initStore(),
});

function RouteComponent() {
  const store = Route.useLoaderData();

  return (
    <>
      <StoreProvider value={store}>
        <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
          <KeyPressedCtxProvider>
            <GlobalListener />

            <Outlet />

            <TanStackRouterDevtools />
          </KeyPressedCtxProvider>
        </ThemeProvider>
      </StoreProvider>
    </>
  );
}

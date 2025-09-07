import { GlobalListener } from "@/features/global-listener/components/GlobalListener";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { KeyPressedCtxProvider } from "@/features/global-listener/components/KeyPressedCtxProvider.tsx";
import { Outlet, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { DBProvider } from "@will-be-done/hyperdb";
import { initDbStore2 } from "@/store2/slices/load2";

export const Route = createRootRoute({
  component: RouteComponent,
  loader: async () => {
    return initDbStore2();
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

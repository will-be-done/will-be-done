import { GlobalListener } from "@/components/GlobalListener/GlobalListener.tsx";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { KeyPressedCtxProvider } from "@/components/GlobalListener/KeyPressedCtxProvider.tsx";
import {
  Outlet,
  redirect,
  createFileRoute,
  useRouterState,
} from "@tanstack/react-router";
import { type SubscribableDB } from "@will-be-done/hyperdb";
import { DBProvider } from "@will-be-done/hyperdb/react";
import { initDbStore } from "@/store/load.ts";
import { authUtils, isDemoMode } from "@/lib/auth";
import { demoSpaceDBConfig, spaceDBConfig } from "@/store/configs";
import { useFocusStore } from "@/store/focusSlice.ts";
import { useEffect } from "react";
import { captureWebAnalytics } from "@/lib/analytics";

export const Route = createFileRoute("/spaces/$spaceId")({
  component: RouteComponent,
  beforeLoad: ({ params }) => {
    return {
      spaceDbPromise: loadSpaceDb(params.spaceId),
    };
  },
  loader: ({ context }) => {
    return context.spaceDbPromise;
  },
});

async function loadSpaceDb(spaceId: string) {
  const isDemo = isDemoMode();

  if (!isDemo && !authUtils.isAuthenticated()) {
    throw redirect({ to: "/login" });
  }

  if (!isDemo) {
    authUtils.setLastUsedSpaceId(spaceId);
  }

  const config = isDemo ? demoSpaceDBConfig() : spaceDBConfig(spaceId);

  return initDbStore(config);
}

function RouteComponent() {
  const newStore = Route.useLoaderData();
  const { spaceId } = Route.useParams();

  useEffect(() => {
    if (isDemoMode()) return;
    captureWebAnalytics({
      name: "space_opened",
      properties: { space_id: spaceId },
    });
  }, [spaceId]);

  return (
    <DBProvider value={newStore as SubscribableDB}>
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <KeyPressedCtxProvider>
          <div className="relative h-full">
            <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-10 [app-region:drag]" />

            <GlobalListener />
            <ResetFocusOnNavigate />

            <Outlet />
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

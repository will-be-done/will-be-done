import { Outlet, createFileRoute } from "@tanstack/react-router";
import { CardDetails } from "@/components/CardDetails/CardDetails.tsx";
import { GlobalLayout } from "@/components/Layout/GlobalLayout.tsx";
import { LayoutWithSidebar } from "@/components/Layout/LayoutWithSidebar";

export const Route = createFileRoute("/spaces/$spaceId/_withSidebar")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <GlobalLayout>
      <LayoutWithSidebar>
        <div className="flex h-full min-h-0">
          <div className="min-w-0 min-w-[300px] flex-1">
            <Outlet />
          </div>
          <div className="hidden h-full sm:block">
            <CardDetails />
          </div>
        </div>
      </LayoutWithSidebar>
    </GlobalLayout>
  );
}

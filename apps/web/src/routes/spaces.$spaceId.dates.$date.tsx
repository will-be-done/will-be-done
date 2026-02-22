import { createFileRoute } from "@tanstack/react-router";
import { parse } from "date-fns";
import { GlobalLayout } from "@/components/Layout/GlobalLayout.tsx";
import { DateView } from "@/components/DateView/DateView.tsx";
import { LayoutWithSidebar } from "@/components/Layout/LayoutWithSidebar";

export const Route = createFileRoute("/spaces/$spaceId/dates/$date")({
  component: RouteComponent,
});

function RouteComponent() {
  const params = Route.useParams();
  const date = parse(params.date, "yyyy-MM-dd", new Date());

  return (
    <GlobalLayout>
      <LayoutWithSidebar>
        <DateView selectedDate={date} />
      </LayoutWithSidebar>
    </GlobalLayout>
  );
}

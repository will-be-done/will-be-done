import { createFileRoute } from "@tanstack/react-router";
import { parse } from "date-fns";
import { DateView } from "@/components/DateView/DateView.tsx";

export const Route = createFileRoute(
  "/spaces/$spaceId/_withSidebar/dates/$date",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const params = Route.useParams();
  const date = parse(params.date, "yyyy-MM-dd", new Date());

  return <DateView selectedDate={date} />;
}

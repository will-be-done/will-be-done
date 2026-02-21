import { createFileRoute } from "@tanstack/react-router";
import { parse } from "date-fns";
import { Layout } from "@/components/Layout/Layout.tsx";
import { DateView } from "@/components/DateView/DateView.tsx";

export const Route = createFileRoute("/spaces/$spaceId/dates/$date")({
  component: RouteComponent,
});

function RouteComponent() {
  const params = Route.useParams();
  const date = parse(params.date, "yyyy-MM-dd", new Date());

  return (
    <Layout>
      <DateView selectedDate={date} />
    </Layout>
  );
}

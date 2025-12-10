import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { parse } from "date-fns";
import { Layout } from "@/components/Layout/Layout.tsx";
import { Board } from "@/components/DaysBoard/DaysBoard.tsx";

const filterParams = z.object({
  projectIds: z.array(z.string()).optional(),
});

export const Route = createFileRoute("/timeline/$date")({
  component: RouteComponent,
  validateSearch: zodValidator(filterParams),
});

function RouteComponent() {
  const params = Route.useParams();
  const date = parse(params.date, "yyyy-MM-dd", new Date());

  return (
    <Layout>c
      <Board selectedDate={date} />
    </Layout>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { parse } from "date-fns";
import { Layout2 } from "@/components/Layout2/Layout2";
import { Board2 } from "@/features/timeline/components/DaysBoard/DaysBoard2";

const filterParams = z.object({
  projectIds: z.array(z.string()).optional(),
});

export const Route = createFileRoute("/timeline2/$date")({
  component: RouteComponent,
  validateSearch: zodValidator(filterParams),
});

function RouteComponent() {
  const params = Route.useParams();
  const date = parse(params.date, "yyyy-MM-dd", new Date());

  return (
    <Layout2>
      <Board2 selectedDate={date} />
    </Layout2>
  );
}

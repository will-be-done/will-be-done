import { Board } from "@/features/timeline/components/DaysBoard/DaysBoard";
import { Layout } from "@/components/Layout/Layout";
import { TaskSuggestions } from "@/features/timeline/components/TaskSuggestions/TaskSuggestions";
import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { parse } from "date-fns";

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
  // const searchParams = Route.useSearch();

  return (
    <Layout sidebarContent={<TaskSuggestions />}>
      <Board selectedDate={date} />
    </Layout>
  );
}

import { Board, BoardPage } from "@/components/DaysBoard/DaysBoard";
import { Layout } from "@/components/Layout/Layout";
import { TaskSuggestions } from "@/components/TaskSuggestions/TaskSuggestions";
import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

const filterParams = z.object({
  projectIds: z.array(z.string()).optional(),
});

export const Route = createFileRoute("/timeline/$date")({
  component: RouteComponent,
  validateSearch: zodValidator(filterParams),
});

function RouteComponent() {
  return (
    <Layout sidebarContent={<TaskSuggestions />}>
      <Board />
    </Layout>
  );
}

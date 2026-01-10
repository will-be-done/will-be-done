import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { parse } from "date-fns";
import { Layout } from "@/components/Layout/Layout.tsx";
import { Board } from "@/components/DaysBoard/DaysBoard.tsx";
import { inboxId } from "@will-be-done/slices";

const filterParams = z.object({
  projectId: z.string().default(inboxId),
});

export const Route = createFileRoute("/spaces/$spaceId/timeline/$date")({
  component: RouteComponent,
  validateSearch: zodValidator(filterParams),
});

function RouteComponent() {
  const params = Route.useParams();
  const { projectId } = Route.useSearch();
  const date = parse(params.date, "yyyy-MM-dd", new Date());

  return (
    <Layout>
      <Board selectedDate={date} selectedProjectId={projectId} />
    </Layout>
  );
}

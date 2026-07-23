import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { addDays, parse, startOfDay } from "date-fns";
import { GlobalLayout } from "@/components/Layout/GlobalLayout.tsx";
import { Board } from "@/components/DaysBoard/DaysBoard.tsx";
import { selectedProject } from "@/components/ProjectView/selectors.ts";
import { asyncDispatch, preloadSelectorAsync } from "@will-be-done/hyperdb";
import { useAsyncSelector } from "@will-be-done/hyperdb/react";
import {
  createManyDailyListsIfNotPresent,
  dailyListsByDates,
  dailyProjectionChildrenForDisplay,
  doneDailyProjectionChildrenForDisplay,
  doneProjectSectionCardsForDisplay,
  inboxProjectId as getInboxProjectId,
  projectSectionsByProjectId,
  projectSectionCardsForDisplayChildren,
  projectsWithTaskStats,
} from "@will-be-done/slices/space";

const filterParams = z.object({
  projectId: z.string().default("inbox"),
});

export const Route = createFileRoute("/spaces/$spaceId/timeline/$date")({
  component: RouteComponent,
  validateSearch: zodValidator(filterParams),
  loaderDeps: ({ search }) => ({ projectId: search.projectId }),
  loader: async ({ context, deps, params }) => {
    const db = await context.spaceDbPromise;
    const selectedDate = startOfDay(
      parse(params.date, "yyyy-MM-dd", new Date()),
    );
    const dates = Array.from({ length: 7 }, (_, i) =>
      addDays(selectedDate, i).getTime(),
    );
    const promises: Promise<unknown>[] = [];
    const appendPromise = (promise: Promise<unknown>) => {
      promises.push(promise);
    };

    await asyncDispatch(db, createManyDailyListsIfNotPresent({ dates }));

    const dailyLists = await preloadSelectorAsync(db, {
      selector: dailyListsByDates,
      args: { dates },
    });

    const inboxProjectId = await preloadSelectorAsync(db, {
      selector: getInboxProjectId,
      args: {},
    });
    const selectedProjectId =
      deps.projectId === "inbox" ? inboxProjectId : deps.projectId;
    const project = await preloadSelectorAsync(db, {
      selector: selectedProject,
      args: { selectedProjectId },
    });

    appendPromise(
      preloadSelectorAsync(db, {
        selector: projectsWithTaskStats,
        args: { currentDate: startOfDay(new Date()).getTime() },
      }),
    );

    const projectSections = await preloadSelectorAsync(db, {
      selector: projectSectionsByProjectId,
      args: { projectId: project.id },
    });

    for (const section of projectSections) {
      appendPromise(
        preloadSelectorAsync(db, {
          selector: projectSectionCardsForDisplayChildren,
          args: { projectSectionId: section.id },
        }),
      );
      appendPromise(
        preloadSelectorAsync(db, {
          selector: doneProjectSectionCardsForDisplay,
          args: { projectSectionId: section.id, limited: true },
        }),
      );
    }

    for (const dailyList of dailyLists) {
      appendPromise(
        preloadSelectorAsync(db, {
          selector: dailyProjectionChildrenForDisplay,
          args: { dailyListId: dailyList.id },
        }),
      );
      appendPromise(
        preloadSelectorAsync(db, {
          selector: doneDailyProjectionChildrenForDisplay,
          args: { dailyListId: dailyList.id },
        }),
      );
    }

    await Promise.all(promises);
  },
});

function RouteComponent() {
  const params = Route.useParams();
  const { projectId } = Route.useSearch();
  const date = parse(params.date, "yyyy-MM-dd", new Date());

  const { data: inboxProjectId = "" } = useAsyncSelector({
    selector: getInboxProjectId,
    args: {},
  });

  return (
    <GlobalLayout>
      <Board
        selectedDate={date}
        selectedProjectId={projectId === "inbox" ? inboxProjectId : projectId}
      />
    </GlobalLayout>
  );
}

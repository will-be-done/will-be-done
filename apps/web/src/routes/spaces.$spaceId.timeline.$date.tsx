import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useCallback } from "react";
import {
  addDays,
  differenceInCalendarDays,
  format,
  parse,
  startOfDay,
} from "date-fns";
import { GlobalLayout } from "@/components/Layout/GlobalLayout.tsx";
import { Board } from "@/components/DaysBoard/DaysBoard.tsx";
import { selectedProject } from "@/components/ProjectView/selectors.ts";
import { asyncDispatch, preloadSelectorAsync } from "@will-be-done/hyperdb";
import { useAsyncSelector } from "@will-be-done/hyperdb/react";
import {
  createManyDailyListsIfNotPresent,
  dailyListsByDates,
  dailyEntryChildrenForDisplay,
  doneDailyEntryChildrenForDisplay,
  doneProjectSectionItemsForDisplay,
  inboxProjectId as getInboxProjectId,
  projectSectionsByProjectId,
  projectSectionItemsForDisplayChildren,
  projectsWithTaskStats,
  externalEventOccurrencesInRange,
  parseDMY,
} from "@will-be-done/slices/space";
import { externalEventsRange } from "@/components/ExternalEvents/useExternalEvents.ts";
import {
  DAY_WIDTH,
  initialRenderedDays,
} from "@/components/DaysBoard/useInfiniteDays.ts";
import {
  OVERSCAN_DAYS,
  dataWindowDates,
} from "@/components/DaysBoard/timelineWindow.ts";

const filterParams = z.object({
  projectId: z.string().default("inbox"),
  // The first day on screen, when scrolled away from the date in the path.
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const parseDate = (date: string) =>
  startOfDay(parse(date, "yyyy-MM-dd", new Date()));

export const Route = createFileRoute("/spaces/$spaceId/timeline/$date")({
  component: RouteComponent,
  validateSearch: zodValidator(filterParams),
  loaderDeps: ({ search }) => ({ projectId: search.projectId }),
  // Scrolling rewrites the day in the URL; the timeline loads what it needs.
  shouldReload: ({ cause }) => cause !== "stay",
  loader: async ({ context, deps, params, location }) => {
    const db = await context.spaceDbPromise;
    const selectedDate = parseDate(params.date);
    const { day: scrollDate } = filterParams.parse(location.search);
    const firstDay = scrollDate
      ? differenceInCalendarDays(parseDate(scrollDate), selectedDate)
      : 0;
    // The dates the timeline queries first; entries are preloaded only for
    // days on its first screen.
    const windowDates = dataWindowDates(
      selectedDate,
      initialRenderedDays(firstDay, OVERSCAN_DAYS),
    );
    const dates = windowDates.map((date) => date.getTime());
    const firstScreenStart = addDays(selectedDate, firstDay).getTime();
    const firstScreenEnd = addDays(
      selectedDate,
      firstDay + Math.ceil(window.innerWidth / DAY_WIDTH),
    ).getTime();
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
          selector: projectSectionItemsForDisplayChildren,
          args: { projectSectionId: section.id },
        }),
      );
      appendPromise(
        preloadSelectorAsync(db, {
          selector: doneProjectSectionItemsForDisplay,
          args: { projectSectionId: section.id, limited: true },
        }),
      );
    }

    appendPromise(
      preloadSelectorAsync(db, {
        selector: externalEventOccurrencesInRange,
        args: externalEventsRange(windowDates),
      }),
    );

    for (const dailyList of dailyLists) {
      const time = parseDMY(dailyList.date).getTime();
      if (time < firstScreenStart || time > firstScreenEnd) continue;

      appendPromise(
        preloadSelectorAsync(db, {
          selector: dailyEntryChildrenForDisplay,
          args: { dailyListId: dailyList.id },
        }),
      );
      appendPromise(
        preloadSelectorAsync(db, {
          selector: doneDailyEntryChildrenForDisplay,
          args: { dailyListId: dailyList.id },
        }),
      );
    }

    await Promise.all(promises);
  },
});

function RouteComponent() {
  const params = Route.useParams();
  const { projectId, day } = Route.useSearch();
  const navigate = Route.useNavigate();
  const date = parse(params.date, "yyyy-MM-dd", new Date());

  const handleScrollDateChange = useCallback(
    (scrollDate: Date, replace: boolean) =>
      void navigate({
        to: ".",
        search: (previous) => ({
          ...previous,
          day: format(scrollDate, "yyyy-MM-dd"),
        }),
        replace,
        resetScroll: false,
      }),
    [navigate],
  );

  const { data: inboxProjectId = "" } = useAsyncSelector({
    selector: getInboxProjectId,
    args: {},
  });

  return (
    <GlobalLayout>
      <Board
        selectedDate={date}
        scrollDate={day ? parseDate(day) : undefined}
        onScrollDateChange={handleScrollDateChange}
        selectedProjectId={projectId === "inbox" ? inboxProjectId : projectId}
      />
    </GlobalLayout>
  );
}

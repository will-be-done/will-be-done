import { createFileRoute } from "@tanstack/react-router";
import { startOfDay } from "date-fns";
import { DailyReportView } from "@/components/DailyReports/DailyReportView.tsx";
import { GlobalLayout } from "@/components/Layout/GlobalLayout.tsx";
import { asyncDispatch, preloadSelectorAsync } from "@will-be-done/hyperdb";
import {
  completedTasksSnapshotForDate,
  createManyDailyListsIfNotPresent,
  dailyListByDate,
  dailyReportsNewest,
  doneDailyEntryChildrenForDisplay,
  getDMY,
} from "@will-be-done/slices/space";

export const Route = createFileRoute("/spaces/$spaceId/daily-reports/$date")({
  component: RouteComponent,
  loader: async ({ context }) => {
    const db = await context.spaceDbPromise;
    const today = startOfDay(new Date());

    const dailyLists = await asyncDispatch(
      db,
      createManyDailyListsIfNotPresent({ dates: [today.getTime()] }),
    );
    const todayKey = getDMY(today);

    await Promise.all([
      preloadSelectorAsync(db, {
        selector: dailyReportsNewest,
        args: {},
      }),
      preloadSelectorAsync(db, {
        selector: completedTasksSnapshotForDate,
        args: { date: todayKey },
      }),
      preloadSelectorAsync(db, {
        selector: dailyListByDate,
        args: { date: todayKey },
      }),
      ...dailyLists.map((dailyList) =>
        preloadSelectorAsync(db, {
          selector: doneDailyEntryChildrenForDisplay,
          args: { dailyListId: dailyList.id },
        }),
      ),
    ]);
  },
});

function RouteComponent() {
  return (
    <GlobalLayout>
      <div className="flex h-full w-full min-h-0">
        <DailyReportView />
      </div>
    </GlobalLayout>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { startOfDay } from "date-fns";
import { PomodoroView } from "@/components/Pomodoro/PomodoroView.tsx";
import { GlobalLayout } from "@/components/Layout/GlobalLayout.tsx";
import { ItemDetails } from "@/components/ItemDetails/ItemDetails.tsx";
import { asyncDispatch, preloadSelectorAsync } from "@will-be-done/hyperdb";
import {
  createManyDailyListsIfNotPresent,
  dailyListsByDates,
  dailyEntryChildrenForDisplay,
  doneDailyEntryChildrenForDisplay,
  inboxProjectId,
} from "@will-be-done/slices/space";

export const Route = createFileRoute("/spaces/$spaceId/pomodoro")({
  component: RouteComponent,
  loader: async ({ context }) => {
    const db = await context.spaceDbPromise;
    const dates = [startOfDay(new Date()).getTime()];
    const promises: Promise<unknown>[] = [];
    const appendPromise = (promise: Promise<unknown>) => {
      promises.push(promise);
    };

    await asyncDispatch(db, createManyDailyListsIfNotPresent({ dates }));

    const dailyLists = await preloadSelectorAsync(db, {
      selector: dailyListsByDates,
      args: { dates },
    });

    appendPromise(
      preloadSelectorAsync(db, { selector: inboxProjectId, args: {} }),
    );

    for (const dailyList of dailyLists) {
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
  return (
    <GlobalLayout>
      <div className="flex h-full w-full min-h-0">
        <div className="h-full min-w-0 flex-1">
          <PomodoroView />
        </div>
        <div className="hidden h-full sm:block">
          <ItemDetails />
        </div>
      </div>
    </GlobalLayout>
  );
}

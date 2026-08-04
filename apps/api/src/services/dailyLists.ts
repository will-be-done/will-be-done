import { selectSync } from "@will-be-done/hyperdb";
import {
  dailyListAllIds,
  dailyListByDate,
  dailyListsByIds,
  dailyListTasksByState,
} from "@will-be-done/slices/space";
import { getSpaceDatabase } from "./databaseAccess";
import { toPublicTask, type PublicTask } from "./tasks";

export function listDailyListItems({
  spaceId,
  userId,
  date,
  state = "todo",
}: {
  spaceId: string;
  userId: string;
  date: string;
  state?: "todo" | "done";
}): PublicTask[] {
  const db = getSpaceDatabase(spaceId, userId);
  const dailyList = selectSync(db, {
    selector: dailyListByDate,
    args: { date },
  });
  if (!dailyList) return [];

  return selectSync(db, {
    selector: dailyListTasksByState,
    args: { dailyListId: dailyList.id, state },
  }).map((task) => toPublicTask(db, task, dailyList.date));
}

export interface PublicDailyList {
  date: string;
  items: PublicTask[];
}

export function listDailyListsInRange({
  spaceId,
  userId,
  from,
  to,
  state = "todo",
}: {
  spaceId: string;
  userId: string;
  from: string;
  to: string;
  state?: "todo" | "done";
}): PublicDailyList[] {
  const db = getSpaceDatabase(spaceId, userId);
  const ids = selectSync(db, { selector: dailyListAllIds, args: {} });
  if (ids.length === 0) return [];

  return selectSync(db, { selector: dailyListsByIds, args: { ids } })
    .filter((dailyList) => dailyList.date >= from && dailyList.date <= to)
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((dailyList) => ({
      date: dailyList.date,
      items: selectSync(db, {
        selector: dailyListTasksByState,
        args: { dailyListId: dailyList.id, state },
      }).map((task) => toPublicTask(db, task, dailyList.date)),
    }));
}

import { describe, expect, it } from "vitest";
import {
  DB,
  createSelector,
  execSync,
  selectSync,
  syncDispatch,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { dbIdTrait } from "../traits";
import {
  createDailyList,
  dailyListById,
  deleteDailyLists,
  dailyListGetId,
  dailyListGetIds,
  dailyListIdsByDates,
} from "./dailyLists";
import { DailyList, dailyListsTable } from "./tables";

const selector = createSelector();

function runSelector<T>(
  db: DB,
  handler: () => Generator<unknown, T, unknown>,
  _deps: unknown[],
): T {
  const testSelector = selector({
    name: "testSelector",
    args: {},
    handler,
  });
  return selectSync(db, { selector: testSelector, args: {} });
}

function createDB() {
  const driver = new BptreeInmemDriver();
  const spaceId = "a0000000-0000-4000-8000-000000000001";
  const db = new DB(driver, { traits: [dbIdTrait("space", spaceId)] });

  execSync(db.loadTables([dailyListsTable]));

  return db;
}

describe("dailyListIdsByDates", () => {
  it("gets daily list ids for date strings in bulk", () => {
    const db = createDB();

    const id = runSelector<string>(
      db,
      function* () {
        return yield* dailyListGetId({ date: "2026-04-19" });
      },
      [],
    );
    const ids = runSelector<string[]>(
      db,
      function* () {
        return yield* dailyListGetIds({ dates: ["2026-04-19"] });
      },
      [],
    );

    expect(ids).toEqual([id]);
  });

  it("returns ids only for daily lists matching the requested dates", () => {
    const db = createDB();

    const dailyList = syncDispatch(
      db,
      createDailyList({ dailyList: { date: "2026-04-19" } }),
    ) as DailyList;
    syncDispatch(db, createDailyList({ dailyList: { date: "2026-04-21" } }));

    const ids = runSelector<string[]>(
      db,
      function* () {
        return yield* dailyListIdsByDates({
          dates: [
            new Date(2026, 3, 18).getTime(),
            new Date(2026, 3, 19).getTime(),
            new Date(2026, 3, 20).getTime(),
          ],
        });
      },
      [],
    );

    expect(ids).toEqual([dailyList.id]);
  });

  it("matches ids used by created daily lists", () => {
    const db = createDB();

    const dailyList = syncDispatch(
      db,
      createDailyList({ dailyList: { date: "2026-04-19" } }),
    ) as DailyList;

    const ids = runSelector<string[]>(
      db,
      function* () {
        return yield* dailyListIdsByDates({
          dates: [new Date(2026, 3, 19).getTime()],
        });
      },
      [],
    );

    expect(ids).toEqual([dailyList.id]);
  });

  it("does not delete deterministic DailyLists through the model command", () => {
    const db = createDB();
    const dailyList = syncDispatch(
      db,
      createDailyList({ dailyList: { date: "2026-04-19" } }),
    ) as DailyList;

    syncDispatch(db, deleteDailyLists({ ids: [dailyList.id] }));

    expect(
      selectSync(db, {
        selector: dailyListById,
        args: { id: dailyList.id },
      }),
    ).toEqual(dailyList);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

type Subscriber = (ops: unknown[]) => void;
type MockDB = {
  subscribe: (cb: Subscriber) => () => void;
  emit(ops: unknown[]): void;
  subscriberCount(): number;
};

const mocks = vi.hoisted(() => ({
  cleanup: undefined as undefined | (() => void),
  db: undefined as unknown as MockDB,
  refs: [] as { current: unknown }[],
  setResult: vi.fn(),
  runSelectorAsync: vi.fn(),
  isNeedToRerunRange: vi.fn(),
}));

vi.mock("react", () => ({
  useCallback: vi.fn((cb) => cb),
  useEffect: vi.fn((effect) => {
    mocks.cleanup = effect();
  }),
  useMemo: vi.fn((factory) => factory()),
  useRef: vi.fn((initial) => {
    const ref = { current: initial };
    mocks.refs.push(ref);
    return ref;
  }),
  useState: vi.fn((initial) => [initial, mocks.setResult]),
  useSyncExternalStore: vi.fn(),
}));

vi.mock("./context", () => ({
  useDB: () => mocks.db,
}));

vi.mock("../hyperdb/commands/query/selector", () => ({
  initSelector: vi.fn(),
  isNeedToRerunRange: (...args: unknown[]) =>
    mocks.isNeedToRerunRange(...args),
  runSelectorAsync: (...args: unknown[]) => mocks.runSelectorAsync(...args),
  select: vi.fn(),
}));

import { useAsyncSelector } from "./hooks";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

function createMockDB() {
  const subscribers: Subscriber[] = [];

  return {
    subscribe: vi.fn((cb: Subscriber) => {
      subscribers.push(cb);

      return () => {
        const index = subscribers.indexOf(cb);
        if (index !== -1) {
          subscribers.splice(index, 1);
        }
      };
    }),
    emit(ops: unknown[]) {
      for (const subscriber of [...subscribers]) {
        subscriber(ops);
      }
    },
    subscriberCount() {
      return subscribers.length;
    },
  };
}

describe("useAsyncSelector", () => {
  beforeEach(() => {
    mocks.cleanup = undefined;
    mocks.db = createMockDB();
    mocks.refs = [];
    mocks.setResult.mockReset();
    mocks.runSelectorAsync.mockReset();
    mocks.isNeedToRerunRange.mockReset();
  });

  it("collapses overlapping subscription reruns and applies only the latest async result", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const firstCmd = { table: "tasks", range: "first" };
    const secondCmd = { table: "tasks", range: "second" };
    let runCount = 0;

    mocks.runSelectorAsync.mockImplementation(
      (_db, _gen, cmds: unknown[]) => {
        runCount++;
        if (runCount === 1) {
          cmds.push(firstCmd);
          return first.promise;
        }

        cmds.push(secondCmd);
        return second.promise;
      },
    );

    useAsyncSelector(function* selector() {
      return "unused";
    }, []);

    expect(mocks.runSelectorAsync).toHaveBeenCalledTimes(1);
    expect(mocks.db.subscribe).toHaveBeenCalledTimes(1);

    mocks.db.emit([{ id: "op-1" }]);
    mocks.db.emit([{ id: "op-2" }]);
    mocks.db.emit([{ id: "op-3" }]);

    expect(mocks.runSelectorAsync).toHaveBeenCalledTimes(1);

    first.resolve("stale");
    await flushPromises();

    expect(mocks.setResult).not.toHaveBeenCalled();
    expect(mocks.runSelectorAsync).toHaveBeenCalledTimes(2);

    second.resolve("latest");
    await flushPromises();

    expect(mocks.setResult).toHaveBeenCalledTimes(1);
    expect(mocks.setResult).toHaveBeenCalledWith("latest");
    expect(mocks.refs[0].current).toEqual([secondCmd]);

    const ignoredOps = [{ id: "ignored" }];
    mocks.isNeedToRerunRange.mockReturnValue(false);

    mocks.db.emit(ignoredOps);

    expect(mocks.isNeedToRerunRange).toHaveBeenCalledWith(
      [secondCmd],
      ignoredOps,
    );
    expect(mocks.runSelectorAsync).toHaveBeenCalledTimes(2);
  });

  it("ignores a pending async selector result after unmount cleanup", async () => {
    const pending = deferred<string>();
    const cmd = { table: "tasks", range: "pending" };

    mocks.runSelectorAsync.mockImplementation(
      (_db, _gen, cmds: unknown[]) => {
        cmds.push(cmd);
        return pending.promise;
      },
    );

    useAsyncSelector(function* selector() {
      return "unused";
    }, []);

    const selectRangeCmdsRef = mocks.refs[0];
    expect(mocks.db.subscriberCount()).toBe(1);

    mocks.cleanup?.();

    expect(mocks.db.subscriberCount()).toBe(0);

    pending.resolve("late");
    await flushPromises();

    expect(mocks.setResult).not.toHaveBeenCalled();
    expect(selectRangeCmdsRef.current).toEqual([]);
  });
});

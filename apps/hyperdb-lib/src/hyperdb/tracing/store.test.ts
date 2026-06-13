import { describe, expect, it } from "vitest";
import {
  HyperDBTraceStore,
  createTraceFrameMeta,
  endTraceError,
  endTraceSuccess,
  enterFramePath,
  startRootTrace,
} from "./store";

const flushTraceNotifications = async (): Promise<void> => {
  await Promise.resolve();
};

describe("devtool tracing store", () => {
  it("activates and deactivates with listeners", () => {
    const store = new HyperDBTraceStore();
    expect(store.isActive()).toBe(false);

    const unsubscribe = store.subscribe(() => {});
    expect(store.isActive()).toBe(true);
    expect(store.getListenerCount()).toBe(1);

    unsubscribe();
    expect(store.isActive()).toBe(false);
    expect(store.getListenerCount()).toBe(0);
  });

  it("does not store traces while inactive", () => {
    const store = new HyperDBTraceStore();
    const context = startRootTrace(
      createTraceFrameMeta("action", "inactive", []),
      store,
    );

    expect(context).toBeUndefined();
    expect(store.getSnapshot()).toEqual([]);
  });

  it("keeps the newest traces within the retention cap", () => {
    const store = new HyperDBTraceStore(2);
    const unsubscribe = store.subscribe(() => {});

    for (const name of ["one", "two", "three"]) {
      const context = startRootTrace(
        createTraceFrameMeta("action", name, []),
        store,
      );
      expect(context).toBeDefined();
      endTraceSuccess(context!);
    }

    expect(store.getSnapshot().map((trace) => trace.name)).toEqual([
      "three",
      "two",
    ]);

    unsubscribe();
  });

  it("does not notify when max trace count is unchanged", async () => {
    const store = new HyperDBTraceStore(2);
    let notifyCount = 0;
    const unsubscribe = store.subscribe(() => {
      notifyCount += 1;
    });

    store.setMaxTraces(2);
    expect(notifyCount).toBe(0);

    store.setMaxTraces(3);
    await flushTraceNotifications();
    expect(notifyCount).toBe(1);

    unsubscribe();
  });

  it("coalesces listener notifications into a microtask", async () => {
    const store = new HyperDBTraceStore();
    let notifyCount = 0;
    const unsubscribe = store.subscribe(() => {
      notifyCount += 1;
    });

    const context = startRootTrace(
      createTraceFrameMeta("action", "coalesced", []),
      store,
    )!;
    endTraceSuccess(context);

    expect(store.getSnapshot()[0]?.status).toBe("success");
    expect(notifyCount).toBe(0);

    await flushTraceNotifications();
    expect(notifyCount).toBe(1);

    unsubscribe();
  });

  it("ignores non-finite max trace counts", () => {
    const store = new HyperDBTraceStore(2);
    const unsubscribe = store.subscribe(() => {});

    for (const name of ["one", "two", "three"]) {
      const context = startRootTrace(
        createTraceFrameMeta("action", name, []),
        store,
      );
      expect(context).toBeDefined();
      endTraceSuccess(context!);
    }

    store.setMaxTraces(Number.NaN);
    store.setMaxTraces(Number.POSITIVE_INFINITY);

    expect(store.getSnapshot().map((trace) => trace.name)).toEqual([
      "three",
      "two",
    ]);

    unsubscribe();
  });

  it("records successful and failed root trace lifecycles", () => {
    const store = new HyperDBTraceStore();
    const unsubscribe = store.subscribe(() => {});

    const success = startRootTrace(
      createTraceFrameMeta("selector", "success", [1]),
      store,
    )!;
    endTraceSuccess(success);

    const failure = startRootTrace(
      createTraceFrameMeta("action", "failure", []),
      store,
    )!;
    endTraceError(failure, new Error("boom"));

    const [failedTrace, successTrace] = store.getSnapshot();
    expect(successTrace?.status).toBe("success");
    expect(successTrace?.durationMs).toBeDefined();
    expect(failedTrace?.status).toBe("error");
    expect(failedTrace?.error?.message).toBe("boom");

    unsubscribe();
  });

  it("attaches nested frames under the active root", () => {
    const store = new HyperDBTraceStore();
    const unsubscribe = store.subscribe(() => {});
    const rootMeta = createTraceFrameMeta("action", "root", []);
    const childMeta = createTraceFrameMeta("selector", "child", ["arg"]);
    const context = startRootTrace(rootMeta, store)!;

    enterFramePath(context, [rootMeta, childMeta]);
    endTraceSuccess(context);

    const trace = store.getSnapshot()[0]!;
    expect(trace.frames[0]?.children).toHaveLength(1);
    expect(trace.frames[0]?.children[0]?.name).toBe("child");
    expect(trace.frames[0]?.children[0]?.args).toEqual(["arg"]);

    unsubscribe();
  });
});

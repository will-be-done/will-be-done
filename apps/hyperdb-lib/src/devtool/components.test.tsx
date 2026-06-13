import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { DB, execSync } from "../hyperdb/db";
import { BptreeInmemDriver } from "../hyperdb/drivers/inmemory/bptree-inmem-driver";
import { SubscribableDB } from "../hyperdb/runtime/subscribable-db";
import {
  HyperDBDevtools,
  HyperDBDevtoolsPanel,
  formatCallTreeOperation,
  formatSelectQuery,
  getCallTreeOperationBadges,
  getCallTreeOperations,
} from "./components";
import {
  createTraceFrameMeta,
  endTraceSuccess,
  hyperDBTraceStore,
  startRootTrace,
} from "../hyperdb/tracing/store";
import type { SelectCommandEvent } from "../hyperdb/tracing/store";
import type {
  MutationEvent,
  RootTrace,
  TraceFrame,
} from "../hyperdb/tracing/store";

const createDB = (): SubscribableDB => {
  const db = new SubscribableDB(new DB(new BptreeInmemDriver()));
  execSync(db.loadTables([]));
  return db;
};

afterEach(() => {
  vi.unstubAllGlobals();
  hyperDBTraceStore.clear();
});

describe("HyperDBDevtools", () => {
  it("renders the toggle and panel", () => {
    const html = renderToString(
      <HyperDBDevtools db={createDB()} initialIsOpen />,
    );

    expect(html).toContain("HDB");
    expect(html).toContain("HyperDB");
    expect(html).toContain("Clear");
  });

  it("renders selected trace details in the panel", () => {
    const unsubscribe = hyperDBTraceStore.subscribe(() => {});
    const context = startRootTrace(
      createTraceFrameMeta("action", "sampleAction", ["arg"]),
    )!;
    endTraceSuccess(context);
    unsubscribe();

    const html = renderToString(<HyperDBDevtoolsPanel db={createDB()} />);

    expect(html).toContain("sampleAction");
    expect(html).toContain("Overview");
  });

  it("respects localStorage open state", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => "true",
      setItem: () => {},
    });

    const html = renderToString(
      <HyperDBDevtools db={createDB()} initialIsOpen={false} />,
    );

    expect(html).toContain("Close HyperDB Devtools");
    expect(html).toContain("Clear");
  });

  it("falls back when localStorage.getItem throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("fail");
      },
      setItem: () => {},
    });

    const html = renderToString(
      <HyperDBDevtools db={createDB()} initialIsOpen={false} />,
    );

    expect(html).toContain("Open HyperDB Devtools");
    expect(html).not.toContain("Clear");
  });

  it("formats select events as SQL-like queries", () => {
    const event: SelectCommandEvent = {
      id: "cmd-1",
      frameId: "frame-1",
      kind: "select",
      tableName: "devtoolTasks",
      index: "projectState",
      where: [
        {
          eq: [{ col: "projectId", val: "project-1" }],
          gt: [],
          gte: [],
          lt: [],
          lte: [{ col: "title", val: "Bob's task" }],
        },
      ],
      bounds: [],
      limit: 5,
      order: "asc",
      startedAt: 0,
      status: "success",
      resultCount: 1,
    };

    expect(formatSelectQuery(event)).toBe(
      [
        "SELECT projectState",
        "FROM devtoolTasks",
        "WHERE projectId = 'project-1' AND title <= 'Bob''s task'",
        "ORDER BY projectState ASC",
        "LIMIT 5;",
      ].join("\n"),
    );
  });

  it("formats alternative where clauses as OR groups", () => {
    const event: SelectCommandEvent = {
      id: "cmd-1",
      frameId: "frame-1",
      kind: "select",
      tableName: "devtoolTasks",
      index: "projectState",
      where: [
        {
          eq: [{ col: "state", val: "todo" }],
          gt: [],
          gte: [],
          lt: [],
          lte: [],
        },
        {
          eq: [{ col: "state", val: "done" }],
          gt: [],
          gte: [],
          lt: [],
          lte: [],
        },
      ],
      bounds: [],
      startedAt: 0,
      status: "success",
    };

    expect(formatSelectQuery(event)).toBe(
      [
        "SELECT projectState",
        "FROM devtoolTasks",
        "WHERE (state = 'todo') OR (state = 'done');",
      ].join("\n"),
    );
  });

  it("orders call tree operations within a frame", () => {
    const rootFrame: TraceFrame = {
      id: "frame-1",
      kind: "action",
      name: "insertProject",
      args: [],
      startedAt: 100,
      durationMs: 200,
      status: "success",
      children: [
        {
          id: "frame-4",
          parentId: "frame-1",
          kind: "action",
          name: "insertFirstTask",
          args: [],
          startedAt: 140,
          durationMs: 50,
          status: "success",
          children: [],
          commandIds: [],
          mutationIds: [],
        },
      ],
      commandIds: ["cmd-2", "cmd-6"],
      mutationIds: ["mutation-3"],
    };

    const selectProject: SelectCommandEvent = {
      id: "cmd-2",
      frameId: "frame-1",
      kind: "select",
      tableName: "projects",
      index: "byId",
      where: [],
      bounds: [],
      startedAt: 110,
      durationMs: 50,
      status: "success",
      resultCount: 1,
    };
    const selectTasks: SelectCommandEvent = {
      id: "cmd-6",
      frameId: "frame-1",
      kind: "select",
      tableName: "tasks",
      index: "byProjectId",
      where: [],
      bounds: [],
      startedAt: 130,
      durationMs: 50,
      status: "success",
      resultCount: 2,
    };
    const insertProject: MutationEvent = {
      id: "mutation-3",
      frameId: "frame-1",
      kind: "insert",
      tableName: "projects",
      rows: [{ id: "project-1" }, { id: "project-2" }],
      startedAt: 120,
      durationMs: 50,
      status: "success",
    };
    const trace: RootTrace = {
      id: "trace-1",
      kind: "action",
      name: "insertProject",
      args: [],
      startedAt: 100,
      durationMs: 200,
      status: "success",
      frames: [rootFrame],
      commandEvents: [selectTasks, selectProject],
      mutationEvents: [insertProject],
    };

    const operations = getCallTreeOperations(rootFrame, trace);

    expect(operations.map((operation) => operation.id)).toEqual([
      "cmd-2",
      "mutation-3",
      "cmd-6",
      "frame-4",
    ]);
    expect(operations.map(formatCallTreeOperation)).toEqual([
      "select projects.byId",
      "insert projects",
      "select tasks.byProjectId",
      "@insertFirstTask",
    ]);
    expect(operations.map(getCallTreeOperationBadges)).toEqual([
      [
        { text: "50ms", tone: "duration" },
        { text: "1 row", tone: "rows" },
      ],
      [
        { text: "50ms", tone: "duration" },
        { text: "2 rows", tone: "rows" },
      ],
      [
        { text: "50ms", tone: "duration" },
        { text: "2 rows", tone: "rows" },
      ],
      [{ text: "50ms", tone: "duration" }],
    ]);
  });
});

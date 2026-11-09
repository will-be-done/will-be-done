import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  DB,
  SubscribableDB,
  createAction,
  createSelector,
  defineTable,
  deleteRows,
  execSync,
  insert,
  selectFrom,
  selectSync,
  syncDispatch,
  upsert,
  v,
  type ExtractSchema,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import {
  changeId,
  changesTable,
  insertChangeFromDelete,
  insertChangeFromInsert,
  insertChangeFromUpdate,
  isDeletedChange,
  mergeChanges,
  type Change,
  type ChangesetArrayType,
} from "./changes";
import { maxHlc } from "./hlc";

// Replicas edit through the same change-recording actions the sync hooks use,
// and every state they reach is an upload the server may receive in any order,
// any number of times.

const itemsTable = defineTable("propertyItems", {
  id: v.string(),
  title: v.string(),
  content: v.optional(v.string()),
  orderToken: v.string(),
});
type Item = ExtractSchema<typeof itemsTable>;
const tables = { [itemsTable.tableName]: itemsTable };

const REPLICAS = 3;
const ENTITIES = 3;
const entityIds = Array.from({ length: ENTITIES }, (_, i) => `entity-${i}`);
// Present on every replica with no change record, like rows that predate the
// change log.
const legacyRow: Item = { id: entityIds.at(-1)!, title: "a", orderToken: "a" };

// Pinned so CI is deterministic. Explore with PROPERTY_SEED=<n> PROPERTY_RUNS=<n>.
const propertyParameters = {
  seed: Number(process.env.PROPERTY_SEED ?? 1),
  numRuns: Number(process.env.PROPERTY_RUNS ?? 200),
};

const action = createAction();
const selector = createSelector();

const readEntity = selector({
  name: "propertyReadEntity",
  args: { id: v.string() },
  handler: function* ({ id }) {
    const row = yield* selectFrom(itemsTable, "byId")
      .where((q) => q.eq("id", id))
      .first();
    const change = yield* selectFrom(changesTable, "byId")
      .where((q) => q.eq("id", changeId(itemsTable.tableName, id)))
      .first();
    return { row, change: change as Change | undefined };
  },
});

const writeEntity = action({
  name: "propertyWriteEntity",
  args: {
    id: v.string(),
    next: v.pass<Item | null>(),
    clientId: v.string(),
    clock: v.string(),
  },
  handler: function* ({ id, next, clientId, clock }) {
    const current = yield* selectFrom(itemsTable, "byId")
      .where((q) => q.eq("id", id))
      .first();
    const tableDef = itemsTable;
    if (next === null) {
      if (!current) return;
      yield* deleteRows(itemsTable, [id]);
      yield* insertChangeFromDelete({
        tableDef,
        row: current,
        clientId,
        nextClock: clock,
      });
    } else if (current) {
      yield* upsert(itemsTable, [next]);
      yield* insertChangeFromUpdate({
        tableDef,
        oldRow: current,
        newRow: next,
        clientId,
        nextClock: clock,
      });
    } else {
      yield* insert(itemsTable, [next]);
      yield* insertChangeFromInsert({
        tableDef,
        row: next,
        clientId,
        nextClock: clock,
      });
    }
  },
});

type Upload = ChangesetArrayType[number]["data"][number];

type Op =
  | {
      kind: "create";
      replica: number;
      entity: number;
      title: string;
      content?: string;
    }
  | {
      kind: "edit";
      replica: number;
      entity: number;
      field: "title" | "orderToken";
      value: string;
    }
  | {
      kind: "setContent";
      replica: number;
      entity: number;
      value: string | null;
    }
  | { kind: "delete"; replica: number; entity: number }
  | { kind: "pull"; replica: number; entity: number; from: number };

// Tiny value domains make equal values from independent writes common.
const valueArb = fc.constantFrom("a", "b", "c");
const replicaArb = fc.integer({ min: 0, max: REPLICAS - 1 });
const entityArb = fc.integer({ min: 0, max: ENTITIES - 1 });
const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.record(
    {
      kind: fc.constant("create" as const),
      replica: replicaArb,
      entity: entityArb,
      title: valueArb,
      content: fc.option(valueArb, { nil: undefined }),
    },
    { requiredKeys: ["kind", "replica", "entity", "title"] },
  ),
  fc.record({
    kind: fc.constant("edit" as const),
    replica: replicaArb,
    entity: entityArb,
    field: fc.constantFrom("title" as const, "orderToken" as const),
    value: valueArb,
  }),
  fc.record({
    kind: fc.constant("setContent" as const),
    replica: replicaArb,
    entity: entityArb,
    value: fc.option(valueArb, { nil: null }),
  }),
  fc.record({
    kind: fc.constant("delete" as const),
    replica: replicaArb,
    entity: entityArb,
  }),
  fc.record({
    kind: fc.constant("pull" as const),
    replica: replicaArb,
    entity: entityArb,
    from: replicaArb,
  }),
);
const historyArb = fc.array(opArb, { minLength: 1, maxLength: 30 });
// Sort keys for a permutation of the uploads; missing keys keep history order.
const orderArb = fc.array(fc.nat(), { maxLength: 30 });

const createDB = () => {
  const db = new DB(new BptreeInmemDriver());
  execSync(db.loadTables([itemsTable, changesTable]));
  return db;
};

const read = (db: DB | SubscribableDB, id: string) =>
  selectSync(db, { selector: readEntity, args: { id } });

const clockAt = (tick: number, actor: string) =>
  `${String(tick).padStart(16, "0")}-00000000-${actor}`;

let serverTick = 1_000_000;
const merge = (db: DB | SubscribableDB, uploads: Upload[]) => {
  if (uploads.length === 0) return;
  syncDispatch(
    db,
    mergeChanges({
      input: [{ tableName: itemsTable.tableName, data: uploads }],
      nextClock: clockAt(++serverTick, "server"),
      clientId: "server",
      registeredSyncableTableNameMap: tables,
    }),
  );
};

const seedLegacyRow = action({
  name: "propertySeedLegacyRow",
  args: {},
  handler: function* () {
    yield* insert(itemsTable, [legacyRow]);
  },
});

const runHistory = (history: Op[]) => {
  const replicas = Array.from({ length: REPLICAS }, () => {
    const db = createDB();
    syncDispatch(db, seedLegacyRow({}));
    return db;
  });
  const uploads: Upload[] = [];
  let tick = 0;

  for (const op of history) {
    const db = replicas[op.replica]!;
    const id = entityIds[op.entity]!;
    const clientId = `replica-${op.replica}`;
    const clock = clockAt(++tick, clientId);
    const { row } = read(db, id);
    const write = (next: Item | null) =>
      syncDispatch(db, writeEntity({ id, next, clientId, clock }));

    if (op.kind === "create") {
      if (row) continue;
      write({
        id,
        title: op.title,
        orderToken: "a",
        ...(op.content === undefined ? {} : { content: op.content }),
      });
    } else if (op.kind === "edit") {
      if (!row || row[op.field] === op.value) continue;
      write({ ...row, [op.field]: op.value });
    } else if (op.kind === "setContent") {
      if (!row || row.content === (op.value ?? undefined)) continue;
      const { content: _cleared, ...rest } = row;
      write(op.value === null ? rest : { ...rest, content: op.value });
    } else if (op.kind === "delete") {
      if (!row) continue;
      write(null);
    } else {
      const source = read(replicas[op.from]!, id);
      if (op.from === op.replica || !source.change) continue;
      syncDispatch(
        db,
        mergeChanges({
          input: [
            {
              tableName: itemsTable.tableName,
              data: [toUpload(source)],
            },
          ],
          nextClock: clock,
          clientId,
          registeredSyncableTableNameMap: tables,
        }),
      );
    }

    const state = read(db, id);
    if (state.change) uploads.push(toUpload(state));
  }
  return { uploads, replicas };
};

const simulate = (history: Op[]): Upload[] => runHistory(history).uploads;

const toUpload = ({
  row,
  change,
}: {
  row: Item | undefined;
  change: Change | undefined;
}): Upload => structuredClone({ change: change!, ...(row ? { row } : {}) });

const permute = <T>(items: T[], order: number[]): T[] =>
  items
    .map((item, index) => ({ item, key: order[index] ?? index, index }))
    .sort((a, b) => a.key - b.key || a.index - b.index)
    .map(({ item }) => item);

// The receipt clock and the winning client are bookkeeping: clients replace
// clientId with their own when applying a download, so only the server's
// arrival order picks it.
const semanticState = (db: DB, ids = entityIds) =>
  ids.map((id) => {
    const { row, change } = read(db, id);
    if (!change) return { row };
    const { updatedAt: _receipt, clientId: _winner, ...semantic } = change;
    return { row, change: semantic };
  });

const mergedOneByOne = (uploads: Upload[]) => {
  const db = createDB();
  for (const upload of uploads) merge(db, [upload]);
  return db;
};

const assertConverges = (uploads: Upload[], order: number[]) => {
  expect(semanticState(mergedOneByOne(permute(uploads, order)))).toEqual(
    semanticState(mergedOneByOne(uploads)),
  );
};

const assertBatchMatchesOneByOne = (uploads: Upload[], order: number[]) => {
  const permuted = permute(uploads, order);
  const batched = createDB();
  merge(batched, permuted);
  expect(semanticState(batched)).toEqual(
    semanticState(mergedOneByOne(permuted)),
  );
};

const assertReplayWritesNothing = (uploads: Upload[], order: number[]) => {
  const db = new SubscribableDB(createDB());
  for (const upload of uploads) merge(db, [upload]);
  const before = entityIds.map((id) => read(db, id));

  let committedOperations = 0;
  const unsubscribe = db.subscribe((operations) => {
    committedOperations += operations.length;
  });
  for (const upload of permute(uploads, order)) merge(db, [upload]);
  unsubscribe();

  expect(committedOperations).toBe(0);
  expect(entityIds.map((id) => read(db, id))).toEqual(before);
};

const assertLifecycleAndWrites = (uploads: Upload[], order: number[]) => {
  const db = mergedOneByOne(permute(uploads, order));

  for (const id of entityIds) {
    const received = uploads.filter((u) => u.change.entityId === id);
    const { row, change } = read(db, id);
    if (received.length === 0) {
      expect(change).toBeUndefined();
      continue;
    }
    expect(change!.deletedAt).toBe(
      maxHlc(received.map((u) => u.change.deletedAt)) ?? null,
    );
    expect(change!.restoredAt).toBe(
      maxHlc(received.map((u) => u.change.restoredAt)),
    );
    expect(row === undefined).toBe(isDeletedChange(change!));
    if (!row) continue;

    // One HLC is one write, so a field's winning clock names its value,
    // including the absence of a cleared optional field.
    for (const [field, clock] of Object.entries(change!.changes)) {
      const writers = received.filter(
        (u) => u.row && u.change.changes[field] === clock,
      );
      expect(writers.length, `${field} @ ${clock}`).toBeGreaterThan(0);
      for (const writer of writers) {
        expect(
          (row as Record<string, unknown>)[field],
          `${field} @ ${clock}`,
        ).toBe((writer.row as Record<string, unknown>)[field]);
      }
    }
    expect(Object.keys(row).every((key) => key in change!.changes)).toBe(true);
  }
};

// Replicas exchange their current states in the generated order, then in full
// rounds until one changes nothing. A sync loop is a round that never comes.
const assertGossipSettles = (history: Op[], order: number[]) => {
  const { uploads, replicas } = runHistory(history);
  let tick = 2_000_000;
  const exchange = (from: number, to: number) => {
    if (from === to) return;
    const data = entityIds
      .map((id) => read(replicas[from]!, id))
      .filter((state) => state.change)
      .map(toUpload);
    if (data.length === 0) return;
    syncDispatch(
      replicas[to]!,
      mergeChanges({
        input: [{ tableName: itemsTable.tableName, data }],
        nextClock: clockAt(++tick, `replica-${to}`),
        clientId: `replica-${to}`,
        registeredSyncableTableNameMap: tables,
      }),
    );
  };
  for (let i = 0; i + 1 < order.length; i += 2) {
    exchange(order[i]! % REPLICAS, order[i + 1]! % REPLICAS);
  }

  // Any write restamps updatedAt, so an unchanged snapshot means no writes.
  const snapshot = () =>
    JSON.stringify(replicas.map((db) => entityIds.map((id) => read(db, id))));
  for (let round = 0; ; round += 1) {
    expect(round, "gossip never settled").toBeLessThanOrEqual(REPLICAS);
    const before = snapshot();
    for (let from = 0; from < REPLICAS; from += 1) {
      for (let to = 0; to < REPLICAS; to += 1) exchange(from, to);
    }
    if (snapshot() === before) break;
  }

  const [first, ...rest] = replicas.map((db) => semanticState(db));
  for (const state of rest) expect(state).toEqual(first);
  const uploaded = entityIds.filter((id) =>
    uploads.some((u) => u.change.entityId === id),
  );
  expect(semanticState(replicas[0]!, uploaded)).toEqual(
    semanticState(mergedOneByOne(uploads), uploaded),
  );
};

const checks = [
  assertConverges,
  assertBatchMatchesOneByOne,
  assertReplayWritesNothing,
  assertLifecycleAndWrites,
];

describe("mergeChanges properties", () => {
  const property =
    (check: (uploads: Upload[], order: number[]) => void) => () =>
      fc.assert(
        fc.property(historyArb, orderArb, (history, order) =>
          check(simulate(history), order),
        ),
        propertyParameters,
      );

  it(
    "converges to the same state in every arrival order",
    property(assertConverges),
  );
  it(
    "merges a whole batch like the same uploads one by one",
    property(assertBatchMatchesOneByOne),
  );
  it(
    "performs no writes when any received upload is replayed",
    property(assertReplayWritesNothing),
  );
  it(
    "keeps lifecycle clocks at their maximum and pairs each value with its write",
    property(assertLifecycleAndWrites),
  );
  it("settles replicas exchanging states in any order on one entity", () =>
    fc.assert(
      fc.property(historyArb, orderArb, assertGossipSettles),
      propertyParameters,
    ));

  // Shrunk counterexamples, kept because random runs can take thousands of
  // cases to reach them again.
  it.each<{ name: string; history: Op[]; order: number[] }>([
    {
      name: "a losing creation replayed after the tombstone",
      history: [
        { kind: "create", replica: 0, entity: 0, title: "a" },
        { kind: "create", replica: 1, entity: 0, title: "a" },
        { kind: "delete", replica: 0, entity: 0 },
      ],
      order: [3],
    },
    {
      name: "a field cleared by the first creator",
      history: [
        { kind: "create", replica: 1, entity: 0, title: "a" },
        { kind: "create", replica: 2, entity: 0, title: "a" },
        { kind: "setContent", replica: 1, entity: 0, value: "a" },
        { kind: "setContent", replica: 2, entity: 0, value: "a" },
        { kind: "setContent", replica: 1, entity: 0, value: null },
      ],
      order: [5, 0, 5],
    },
    {
      name: "an edit to a restore by the later creator",
      history: [
        { kind: "create", replica: 0, entity: 0, title: "a" },
        { kind: "create", replica: 2, entity: 0, title: "a" },
        { kind: "delete", replica: 2, entity: 0 },
        { kind: "create", replica: 2, entity: 0, title: "a" },
        { kind: "setContent", replica: 2, entity: 0, value: "a" },
      ],
      order: [5],
    },
  ])("holds for $name", ({ history, order }) => {
    const uploads = simulate(history);
    for (const check of checks) check(uploads, order);
    assertGossipSettles(history, order);
  });
});

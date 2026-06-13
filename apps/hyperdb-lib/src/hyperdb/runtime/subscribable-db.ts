/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  HyperDB,
  HyperDBTx,
} from "../core/contracts";
import type { Row, SelectOptions, Trait, WhereClause } from "../core/primitives";
import { runCommandGenerator } from "../commands/runner";
import type { DBCmd } from "../commands/async";
// import { collectAll } from "../commands/async";
import type { ExtractIndexes, ExtractSchema, TableDefinition } from "../schema/table";
import { getTraceContextForDB } from "../tracing/context";
import {
  beginMutationEvent,
  endMutationEventError,
  endMutationEventSuccess,
  getCurrentTraceFrame,
} from "../tracing/store";
import { refVar, type RefVar } from "../utils";

export type InsertOp = {
  type: "insert";
  table: TableDefinition;
  newValue: Row;
};

export type UpsertOp = {
  type: "upsert";
  table: TableDefinition;
  oldValue?: Row;
  newValue: Row;
};

export type DeleteOp = {
  type: "delete";
  table: TableDefinition;
  oldValue: Row;
};

export type Op = InsertOp | UpsertOp | DeleteOp;
type Subscriber = (op: Op[], traits: Trait[], revision: number) => void;

type AfterInsertSub = (
  db: HyperDB,
  table: TableDefinition,
  traits: Trait[],
  ops: InsertOp[],
) => Generator<unknown, void, unknown>;

type AfterUpsertSub = (
  db: HyperDB,
  table: TableDefinition,
  traits: Trait[],
  ops: UpsertOp[],
) => Generator<unknown, void, unknown>;

type AfterDeleteSub = (
  db: HyperDB,
  table: TableDefinition,
  traits: Trait[],
  ops: DeleteOp[],
) => Generator<unknown, void, unknown>;

type AfterChangeSub = (
  db: HyperDB,
  table: TableDefinition,
  traits: Trait[],
  ops: Op[],
) => Generator<unknown, void, unknown>;

function appendOps(target: Op[], ops: Op[]) {
  for (const op of ops) {
    target.push(op);
  }
}

function removeSubscriber<T>(subscribers: T[], cb: T) {
  for (let i = subscribers.length - 1; i >= 0; i--) {
    if (subscribers[i] === cb) {
      subscribers.splice(i, 1);
    }
  }
}

export class SubscribableDBTx implements HyperDBTx {
  // NOTE: ops could be optimized bu zipping them + each tx type will be in insert, upsert, delete batches.
  // That will make async db tx apply very fast. Right now we need to wait each op of tx to finish
  // before applying next one. Cause otherwise if we will do in unordered way, we could get upsert before insert, for example.
  operations: Op[];

  private subDb: SubscribableDB;
  private txDb: HyperDBTx;

  private committed: RefVar<boolean>;
  private rollbacked: RefVar<boolean>;
  private txCounter: RefVar<number>;
  private traits: Trait[];

  constructor(
    subDb: SubscribableDB,
    txDb: HyperDBTx,
    ops: Op[] = [],
    committed: RefVar<boolean> = refVar(false),
    rollbacked: RefVar<boolean> = refVar(false),
    txCounter: RefVar<number> = refVar(1),
    traits: Trait[] = [],
  ) {
    this.subDb = subDb;
    this.txDb = txDb;
    this.operations = ops;
    this.committed = committed;
    this.rollbacked = rollbacked;
    this.txCounter = txCounter;
    this.traits = traits;
  }

  getTraits(): Trait[] {
    return [...this.traits, ...this.subDb.getTraits()];
  }

  *loadTables(): Generator<DBCmd, void> {
    throw new Error("Not supported");
  }

  withTraits(...traits: Trait[]): HyperDBTx {
    return new SubscribableDBTx(
      this.subDb,
      this.txDb,
      this.operations,
      this.committed,
      this.rollbacked,
      this.txCounter,
      [...this.traits, ...traits],
    );
  }

  *beginTx(): Generator<DBCmd, HyperDBTx> {
    this.txCounter.val++;

    return this;
  }

  *intervalScan<
    TTable extends TableDefinition,
    K extends keyof ExtractIndexes<TTable>,
  >(
    table: TTable,
    indexName: K,
    clauses: WhereClause[],
    selectOptions?: SelectOptions,
  ): Generator<DBCmd, ExtractSchema<TTable>[]> {
    this.throwIfDone();

    return yield* this.txDb.intervalScan(
      table,
      indexName,
      clauses,
      selectOptions,
    );
  }

  *insert<TTable extends TableDefinition<any>>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ): Generator<DBCmd, void> {
    this.throwIfDone();
    if (records.length === 0) return;

    const traceContext = getTraceContextForDB(this);
    const mutationEvent = traceContext
      ? beginMutationEvent(traceContext, getCurrentTraceFrame(traceContext), {
          kind: "insert",
          tableName: table.tableName,
          newValue: records,
          rows: records,
        })
      : undefined;

    try {
      yield* this.txDb.insert(table, records);
    } catch (error) {
      if (traceContext && mutationEvent) {
        endMutationEventError(traceContext, mutationEvent, error);
      }
      throw error;
    }

    const insertOps = records.map(
      (r) =>
        ({
          type: "insert",
          table,
          newValue: r,
        }) satisfies InsertOp,
    );
    appendOps(this.operations, insertOps);
    if (traceContext && mutationEvent) {
      endMutationEventSuccess(traceContext, mutationEvent, {
        newValue: records,
        rows: records,
      });
    }

    for (const cb of this.subDb.afterInsertSubscribers) {
      yield* runCommandGenerator(
        this,
        cb(this, table, this.getTraits(), insertOps),
        { allowWrites: true, traceContext },
      );
    }
    for (const cb of this.subDb.afterChangeSubscribers) {
      yield* runCommandGenerator(
        this,
        cb(this, table, this.getTraits(), insertOps),
        { allowWrites: true, traceContext },
      );
    }
  }

  *upsert<TTable extends TableDefinition<any>>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ): Generator<DBCmd, void> {
    this.throwIfDone();
    if (records.length === 0) return;

    let upsertRecords = records;
    const recordIds = new Set<string>();
    let hasDuplicateIds = false;
    for (const record of records) {
      if (recordIds.has(record.id)) {
        hasDuplicateIds = true;
        break;
      }
      recordIds.add(record.id);
    }

    if (hasDuplicateIds) {
      const seenIds = new Set<string>();
      upsertRecords = [];
      for (let i = records.length - 1; i >= 0; i--) {
        const record = records[i];
        if (seenIds.has(record.id)) continue;
        seenIds.add(record.id);
        upsertRecords.push(record);
      }
      upsertRecords.reverse();
    }

    const previousRecords = new Map<string, Row>();
    const traceContext = getTraceContextForDB(this);
    const mutationEvent = traceContext
      ? beginMutationEvent(traceContext, getCurrentTraceFrame(traceContext), {
          kind: "upsert",
          tableName: table.tableName,
          newValue: upsertRecords,
          rows: upsertRecords,
        })
      : undefined;

    try {
      for (const oldRecord of yield* this.txDb.intervalScan(
        table,
        table.idIndexName,
        upsertRecords.map((r) => ({ eq: [{ col: "id", val: r.id }] })),
      )) {
        previousRecords.set(oldRecord.id, oldRecord);
      }

      yield* this.txDb.upsert(table, upsertRecords);
    } catch (error) {
      if (traceContext && mutationEvent) {
        endMutationEventError(traceContext, mutationEvent, error);
      }
      throw error;
    }

    const upsertOps = upsertRecords.map(
      (record) =>
        ({
          type: "upsert",
          table,
          oldValue: previousRecords.get(record.id),
          newValue: record,
        }) satisfies UpsertOp,
    );
    appendOps(this.operations, upsertOps);
    if (traceContext && mutationEvent) {
      endMutationEventSuccess(traceContext, mutationEvent, {
        oldValue: Array.from(previousRecords.values()),
        newValue: upsertRecords,
        rows: upsertRecords,
      });
    }

    for (const cb of this.subDb.afterUpsertSubscribers) {
      yield* runCommandGenerator(
        this,
        cb(this, table, this.getTraits(), upsertOps),
        { allowWrites: true, traceContext },
      );
    }
    for (const cb of this.subDb.afterChangeSubscribers) {
      yield* runCommandGenerator(
        this,
        cb(this, table, this.getTraits(), upsertOps),
        { allowWrites: true, traceContext },
      );
    }
  }

  *delete<TTable extends TableDefinition<any>>(
    table: TTable,
    ids: string[],
  ): Generator<DBCmd, void> {
    this.throwIfDone();
    if (ids.length === 0) return;

    const deleteOps: DeleteOp[] = [];
    const traceContext = getTraceContextForDB(this);
    const mutationEvent = traceContext
      ? beginMutationEvent(traceContext, getCurrentTraceFrame(traceContext), {
          kind: "delete",
          tableName: table.tableName,
          ids,
        })
      : undefined;

    try {
      for (const oldRecord of yield* this.txDb.intervalScan(
        table,
        table.idIndexName,
        ids.map((id) => ({ eq: [{ col: "id", val: id }] })),
      )) {
        deleteOps.push({ type: "delete", table, oldValue: oldRecord });
      }
      appendOps(this.operations, deleteOps);

      yield* this.txDb.delete(table, ids);
    } catch (error) {
      if (traceContext && mutationEvent) {
        endMutationEventError(traceContext, mutationEvent, error);
      }
      throw error;
    }

    if (traceContext && mutationEvent) {
      endMutationEventSuccess(traceContext, mutationEvent, {
        ids,
        oldValue: deleteOps.map((op) => op.oldValue),
      });
    }

    for (const cb of this.subDb.afterDeleteSubscribers) {
      yield* runCommandGenerator(
        this,
        cb(this, table, this.getTraits(), deleteOps),
        { allowWrites: true, traceContext },
      );
    }
    for (const cb of this.subDb.afterChangeSubscribers) {
      yield* runCommandGenerator(
        this,
        cb(this, table, this.getTraits(), deleteOps),
        { allowWrites: true, traceContext },
      );
    }
  }

  *rollback(): Generator<DBCmd, void> {
    this.throwIfDone();
    yield* this.txDb.rollback();
    this.rollbacked.val = true;
  }

  *commit(): Generator<DBCmd, void> {
    this.txCounter.val--;
    if (this.txCounter.val !== 0) return;

    this.throwIfDone();
    yield* this.txDb.commit();
    this.committed.val = true;
    const traits = this.getTraits();
    const revision = this.subDb.incrementRevision();
    const subscribers = [...this.subDb.subscribers];
    for (const subscriber of subscribers) {
      try {
        subscriber(this.operations, traits, revision);
      } catch (error) {
        console.error(error);
      }
    }
  }

  throwIfDone() {
    if (this.committed.val) {
      throw new Error("Cannot modify a committed tx");
    }

    if (this.rollbacked.val) {
      throw new Error("Cannot modify a rollbacked tx");
    }
  }
}

export class SubscribableDB implements HyperDB {
  subscribers: Subscriber[] = [];
  db: HyperDB;

  afterInsertSubscribers: AfterInsertSub[] = [];
  afterUpsertSubscribers: AfterUpsertSub[] = [];
  afterDeleteSubscribers: AfterDeleteSub[] = [];
  afterChangeSubscribers: AfterChangeSub[] = [];
  traits: Trait[] = [];
  private revision: RefVar<number>;

  constructor(
    db: HyperDB,
    subscribers: Subscriber[] = [],
    afterInsertSubscribers: AfterInsertSub[] = [],
    afterUpsertSubscribers: AfterUpsertSub[] = [],
    afterDeleteSubscribers: AfterDeleteSub[] = [],
    afterChangeSubscribers: AfterChangeSub[] = [],
    traits: Trait[] = [],
    revision: RefVar<number> = refVar(0),
  ) {
    this.db = db;
    this.subscribers = subscribers;
    this.afterInsertSubscribers = afterInsertSubscribers;
    this.afterUpsertSubscribers = afterUpsertSubscribers;
    this.afterDeleteSubscribers = afterDeleteSubscribers;
    this.afterChangeSubscribers = afterChangeSubscribers;
    this.traits = traits;
    this.revision = revision;
  }

  getRevision(): number {
    return this.revision.val;
  }

  incrementRevision(): number {
    this.revision.val++;
    return this.revision.val;
  }

  loadTables(tables: TableDefinition<any>[]): Generator<DBCmd, void> {
    return this.db.loadTables(tables);
  }

  *beginTx(): Generator<DBCmd, HyperDBTx> {
    return new SubscribableDBTx(
      this,
      yield* this.db.beginTx(),
      // this.subscribers,
      // this.afterInsertSubscribers,
      // this.traits,
    );
  }

  withTraits(...traits: Trait[]): HyperDB {
    return new SubscribableDB(
      this.db,
      this.subscribers,
      this.afterInsertSubscribers,
      this.afterUpsertSubscribers,
      this.afterDeleteSubscribers,
      this.afterChangeSubscribers,
      [...this.traits, ...traits],
      this.revision,
    );
  }

  getTraits(): Trait[] {
    return [...this.traits, ...this.db.getTraits()];
  }

  afterInsert(cb: AfterInsertSub): () => void {
    this.afterInsertSubscribers.push(cb);

    return () => {
      removeSubscriber(this.afterInsertSubscribers, cb);
    };
  }

  afterUpsert(cb: AfterUpsertSub): () => void {
    this.afterUpsertSubscribers.push(cb);

    return () => {
      removeSubscriber(this.afterUpsertSubscribers, cb);
    };
  }

  afterDelete(cb: AfterDeleteSub): () => void {
    this.afterDeleteSubscribers.push(cb);

    return () => {
      removeSubscriber(this.afterDeleteSubscribers, cb);
    };
  }

  afterChange(cb: AfterChangeSub): () => void {
    this.afterChangeSubscribers.push(cb);

    return () => {
      removeSubscriber(this.afterChangeSubscribers, cb);
    };
  }

  subscribe(cb: Subscriber): () => void {
    this.subscribers.push(cb);

    return () => {
      removeSubscriber(this.subscribers, cb);
    };
  }

  *intervalScan<
    TTable extends TableDefinition<any, any>,
    K extends keyof ExtractIndexes<TTable>,
  >(
    table: TTable,
    indexName: K,
    clauses: WhereClause[],
    selectOptions?: SelectOptions,
  ): Generator<DBCmd, ExtractSchema<TTable>[]> {
    if (clauses && clauses.length === 0) {
      return [];
    }

    return yield* this.db.intervalScan(
      table,
      indexName,
      clauses,
      selectOptions,
    );
  }

  *insert<TTable extends TableDefinition<any>>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ): Generator<DBCmd, void> {
    if (records.length === 0) return;

    const tx = yield* this.beginTx();

    yield* tx.insert(table, records);
    yield* tx.commit();
  }

  *upsert<TTable extends TableDefinition<any>>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ) {
    if (records.length === 0) return;

    const tx = yield* this.beginTx();

    yield* tx.upsert(table, records);
    yield* tx.commit();
  }

  *delete<TTable extends TableDefinition<any>>(table: TTable, ids: string[]) {
    if (ids.length === 0) return;

    const tx = yield* this.beginTx();

    yield* tx.delete(table, ids);
    yield* tx.commit();
  }
}

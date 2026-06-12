/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  Row,
  ScanValue,
  SelectOptions,
  TupleScanOptions,
  Value,
  WhereClause,
} from "../../core/primitives";
import type { DBDriver, DBDriverTX } from "../../core/driver";
import type { TableDefinition } from "../../schema/table";
import { InMemoryBinaryPlusTree } from "../../structures/bptree";
import { compareStoredTuple, compareTuple } from "../../core/query/tuple";
import { convertWhereToBound } from "../../core/query/bounds";
import type { DBCmd } from "../../commands/async";

type TableData = {
  tableDef: TableDefinition;
  indexes: Map<string, Index>;
  idIndex: HashIndex;
};

type TxTableData = {
  tableDef: TableDefinition;
  indexes: Map<string, IndexTx>;
  idIndex: HashIndexTx;
};

type BtreeIndexDef = {
  name: string;
  columns: string[];
  includeMissing: boolean;
};

type HashIndexDef = {
  name: string;
  column: string;
};

const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function assertSafeIdentifier(kind: string, value: string): void {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new Error(`${kind} must be a safe SQL/JSON identifier: ${value}`);
  }
}

function assertSafeTableDefinition(tableDef: TableDefinition): void {
  assertSafeIdentifier("Table name", tableDef.tableName);

  for (const [indexName, indexDef] of Object.entries(tableDef.indexes)) {
    assertSafeIdentifier("Index name", indexName);

    for (const col of indexDef.cols) {
      assertSafeIdentifier("Index column", String(col));
    }
  }
}

function isSchemalessTable(tableDef: TableDefinition): boolean {
  return !tableDef.schemaValidator;
}

const getIndexKey = (
  row: Row,
  indexColumns: string[],
  includeMissing = false,
): ScanValue[] | undefined => {
  const values: unknown[] = [];

  for (const col of indexColumns) {
    if (!Object.prototype.hasOwnProperty.call(row, col)) {
      if (!includeMissing) return undefined;
      values.push(undefined);
      continue;
    }

    const value = row[col];
    values.push(value === undefined ? null : value);
  }

  return values as ScanValue[];
};

const getHashIndexValue = (row: Row, column: string): Value | undefined => {
  if (!Object.prototype.hasOwnProperty.call(row, column)) return undefined;

  const value = row[column];
  return value === undefined ? null : (value as Value);
};

type BtreeEntry = { key: ScanValue[]; value: Row };

class BinaryHeap<T> {
  private items: T[] = [];
  private compare: (a: T, b: T) => number;

  constructor(compare: (a: T, b: T) => number) {
    this.compare = compare;
  }

  get size() {
    return this.items.length;
  }

  push(item: T) {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): T | undefined {
    const first = this.items[0];
    const last = this.items.pop();
    if (last !== undefined && this.items.length > 0) {
      this.items[0] = last;
      this.bubbleDown(0);
    }
    return first;
  }

  private bubbleUp(index: number) {
    while (index > 0) {
      const parentIndex = (index - 1) >> 1;
      if (this.compare(this.items[index], this.items[parentIndex]) >= 0) break;
      [this.items[index], this.items[parentIndex]] = [
        this.items[parentIndex],
        this.items[index],
      ];
      index = parentIndex;
    }
  }

  private bubbleDown(index: number) {
    while (true) {
      const leftIndex = index * 2 + 1;
      const rightIndex = leftIndex + 1;
      let smallestIndex = index;

      if (
        leftIndex < this.items.length &&
        this.compare(this.items[leftIndex], this.items[smallestIndex]) < 0
      ) {
        smallestIndex = leftIndex;
      }

      if (
        rightIndex < this.items.length &&
        this.compare(this.items[rightIndex], this.items[smallestIndex]) < 0
      ) {
        smallestIndex = rightIndex;
      }

      if (smallestIndex === index) break;

      [this.items[index], this.items[smallestIndex]] = [
        this.items[smallestIndex],
        this.items[index],
      ];
      index = smallestIndex;
    }
  }
}

function* filterBtreeIterator(
  iterator: IterableIterator<BtreeEntry>,
  shouldSkip: (row: Row) => boolean,
): IterableIterator<BtreeEntry> {
  for (const item of iterator) {
    if (shouldSkip(item.value)) continue;
    yield item;
  }
}

const mergeBtreeIterators = (
  iterators: IterableIterator<BtreeEntry>[],
  selectOptions: SelectOptions,
  compareKey: (a: ScanValue[], b: ScanValue[]) => number = compareTuple,
): Row[] => {
  if (selectOptions.limit !== undefined && selectOptions.limit <= 0) return [];

  type MergeCursor = {
    iterator: IterableIterator<BtreeEntry>;
    current: BtreeEntry;
    sequence: number;
  };

  const reverse = selectOptions.order === "desc";
  const heap = new BinaryHeap<MergeCursor>((a, b) => {
    const keyComparison = compareKey(a.current.key, b.current.key);
    if (keyComparison !== 0) return reverse ? -keyComparison : keyComparison;
    return a.sequence - b.sequence;
  });

  iterators.forEach((iterator, sequence) => {
    const next = iterator.next();
    if (!next.done) {
      heap.push({ iterator, current: next.value, sequence });
    }
  });

  const seenIds = new Set<string>();
  const results: Row[] = [];

  while (heap.size > 0) {
    const cursor = heap.pop();
    if (!cursor) break;

    const row = cursor.current.value;
    if (!seenIds.has(row.id)) {
      seenIds.add(row.id);
      results.push(row);

      if (
        selectOptions.limit !== undefined &&
        results.length >= selectOptions.limit
      ) {
        return results;
      }
    }

    const next = cursor.iterator.next();
    if (!next.done) {
      cursor.current = next.value;
      heap.push(cursor);
    }
  }

  return results;
};

const createBtreeScanIterators = (
  btree: InMemoryBinaryPlusTree<ScanValue[], Row>,
  tupleBounds: TupleScanOptions[],
  selectOptions: SelectOptions,
): IterableIterator<BtreeEntry>[] =>
  tupleBounds.map((bounds) =>
    btree.iterate({
      ...bounds,
      reverse: selectOptions.order === "desc",
    }),
  );

const scanBtree = (
  btree: InMemoryBinaryPlusTree<ScanValue[], Row>,
  tupleBounds: TupleScanOptions[],
  selectOptions: SelectOptions,
  compareKey: (a: ScanValue[], b: ScanValue[]) => number = compareTuple,
): Row[] =>
  mergeBtreeIterators(
    createBtreeScanIterators(btree, tupleBounds, selectOptions),
    selectOptions,
    compareKey,
  );

function performScan(
  tableData: TableData | TxTableData,
  indexName: string,
  clauses: WhereClause[],
  selectOptions: SelectOptions,
) {
  const index = tableData.indexes.get(indexName as string);

  if (!index)
    throw new Error(
      "Index not found: " +
        indexName +
        " for table: " +
        tableData.tableDef.tableName,
    );

  const tupleBounds = convertWhereToBound(index.cols(), clauses);

  return index.scan(tupleBounds, selectOptions);
}

function performDelete(tblData: TableData | TxTableData, ids: string[]) {
  const records = tblData.idIndex.scan(
    ids.map((id) => ({ lte: [id], gte: [id] })),
    {},
  );

  for (const index of tblData.indexes.values()) {
    index.delete(records);
  }
}

function validateRecordIds(
  tblData: TableData | TxTableData,
  values: Row[],
  options: { allowExisting: boolean },
) {
  const ids = new Set<string>();
  for (const value of values) {
    if (typeof value.id !== "string") {
      throw new Error("Inserted records must have a string id");
    }
    if (ids.has(value.id)) {
      throw new Error(`Record with duplicate id already exists: ${value.id}`);
    }
    ids.add(value.id);
  }

  if (options.allowExisting) return;

  const existing = tblData.idIndex.scan(
    [...ids].map((id) => ({ gte: [id], lte: [id] })),
    { limit: 1 },
  );
  const existingId = existing[0]?.id;
  if (existingId !== undefined) {
    throw new Error(`Record with duplicate id already exists: ${existingId}`);
  }
}

function performInsert(tblData: TableData | TxTableData, values: Row[]) {
  for (const value of values) {
    Object.freeze(value);
  }

  // NOTE: performance will be noot good here. Maybe make fastInsert?
  validateRecordIds(tblData, values, { allowExisting: false });

  for (const index of tblData.indexes.values()) {
    index.insert(values);
  }
}

function performUpsert(tblData: TableData | TxTableData, records: Row[]) {
  for (const value of records) {
    Object.freeze(value);
  }

  validateRecordIds(tblData, records, { allowExisting: true });

  performDelete(
    tblData,
    records.map((r) => r.id),
  );
  performInsert(tblData, records);
}

interface BaseIndex {
  type: "btree" | "hash";
  scan(tupleBounds: TupleScanOptions[], selectOptions: SelectOptions): Row[];
  cols(): string[];

  insert(values: Row[]): void;
  delete(values: Row[]): void;
}

interface IndexTx extends BaseIndex {
  commit(): void;
}

interface Index extends BaseIndex {
  tx(): IndexTx;
}

const getColumnValuesFromBounds = (
  indexDef: HashIndexDef,
  tupleBounds: TupleScanOptions[],
) => {
  const idxValues = new Set<Value>();

  for (const bound of tupleBounds) {
    if (
      (bound.gt !== undefined && bound.gt.length > 0) ||
      (bound.lt !== undefined && bound.lt.length > 0)
    ) {
      throw new Error(
        "Hash index doesn't support range conditions for column '" +
          indexDef.column +
          "'",
      );
    }

    if (
      (bound.lte && bound.lte.length !== 1) ||
      (bound.gte && bound.gte.length !== 1) ||
      !bound.lte ||
      !bound.gte
      // (bound.lte === undefined &&
      //   bound.gte === undefined &&
      //   bound.lt === undefined &&
      //   bound.gt === undefined)
    ) {
      throw new Error(
        "Hash index should have exactly one equality condition for column '" +
          indexDef.column +
          "' and index name '" +
          indexDef.name +
          "': " +
          JSON.stringify(bound),
      );
    }

    if (bound.lte?.[0] !== bound.gte?.[0]) {
      throw new Error(
        "Hash index should have the same equality condition for column '" +
          indexDef.column +
          "'",
      );
    }

    idxValues.add(bound.lte?.[0] as Value);
  }

  return idxValues;
};

class HashIndex implements Index {
  type = "hash" as const;
  indexDef: HashIndexDef;
  records: Map<Value, Map<string, Row>> = new Map();

  constructor(indexDef: HashIndexDef) {
    this.indexDef = indexDef;
  }

  cols(): string[] {
    return [this.indexDef.column];
  }

  scan(tupleBounds: TupleScanOptions[], selectOptions: SelectOptions): Row[] {
    const idxValues = getColumnValuesFromBounds(this.indexDef, tupleBounds);

    const results: Row[] = [];

    for (const idxValue of idxValues) {
      const rows = this.records.get(idxValue);

      if (!rows) continue;

      results.push(...rows.values());

      if (
        selectOptions.limit !== undefined &&
        results.length >= selectOptions.limit
      ) {
        results.splice(selectOptions.limit);

        return results;
      }
    }

    return results;
  }

  insert(values: Row[]): void {
    for (const record of values) {
      const colValue = getHashIndexValue(record, this.indexDef.column);
      if (colValue === undefined) continue;

      const rows = this.records.get(colValue);

      if (!rows) {
        const m = new Map();
        m.set(record.id, record);
        this.records.set(colValue, m);
      } else {
        rows.set(record.id, record);
      }
    }
  }

  delete(values: Row[]): void {
    for (const record of values) {
      const col = getHashIndexValue(record, this.indexDef.column);
      if (col === undefined) continue;

      const rows = this.records.get(col);

      if (!rows) continue;

      rows.delete(record.id);
    }
  }

  tx(): IndexTx {
    return new HashIndexTx(this);
  }
}

type RowId = string;
type ColumnValue = Value;
class HashIndexTx implements IndexTx {
  type = "hash" as const;
  originalIndex: HashIndex;
  isCommitted = false;

  sets: Map<ColumnValue, Map<RowId, Row>> = new Map();
  deletes: Map<ColumnValue, Set<RowId>> = new Map();

  constructor(index: HashIndex) {
    this.originalIndex = index;
  }

  cols(): string[] {
    return [this.originalIndex.indexDef.column];
  }

  commit(): void {
    if (this.isCommitted) throw new Error("Can't commit after commit");

    this.isCommitted = true;

    // Apply all insertions to the original index
    for (const [, rows] of this.sets) {
      const records = Array.from(rows.values());
      this.originalIndex.insert(records);
    }

    // Apply all deletions to the original index
    for (const [colValue, rowIds] of this.deletes) {
      const records: Row[] = [];
      for (const rowId of rowIds) {
        // Find the record in the original index to get full row data
        const originalRows = this.originalIndex.records.get(colValue);
        if (originalRows) {
          const record = originalRows.get(rowId);
          if (record) {
            records.push(record);
          }
        }
      }
      if (records.length > 0) {
        this.originalIndex.delete(records);
      }
    }
  }

  scan(tupleBounds: TupleScanOptions[], selectOptions: SelectOptions): Row[] {
    if (this.isCommitted) throw new Error("Can't scan after commit");

    const boundValues = getColumnValuesFromBounds(
      this.originalIndex.indexDef,
      tupleBounds,
    );

    const deletedRowIds = new Set<RowId>();
    for (const value of boundValues) {
      const deletes = this.deletes.get(value);
      if (!deletes) continue;

      for (const rowId of deletes) {
        deletedRowIds.add(rowId);
      }
    }

    const seenRowIds = new Set<RowId>();
    let totalCount = 0;

    const results: Row[] = [];

    // 1. Yield records from transaction sets first
    for (const value of boundValues) {
      const sets = this.sets.get(value);
      if (!sets) continue;

      for (const [rowId, row] of sets) {
        if (deletedRowIds.has(rowId)) continue;

        // TODO: could be done in bulk
        seenRowIds.add(rowId);
        results.push(row);
        totalCount++;

        if (
          selectOptions?.limit !== undefined &&
          totalCount >= selectOptions.limit
        ) {
          results.splice(selectOptions.limit);

          return results;
        }
      }
    }

    // 2. Yield records from original index, excluding already seen and deleted
    for (const row of this.originalIndex.scan(tupleBounds, {
      ...selectOptions,
      limit: undefined,
    })) {
      if (deletedRowIds.has(row.id) || seenRowIds.has(row.id)) continue;

      // TODO: could be done in bulk
      results.push(row);
      totalCount++;

      if (
        selectOptions?.limit !== undefined &&
        totalCount >= selectOptions.limit
      ) {
        results.splice(selectOptions.limit);

        return results;
      }
    }

    return results;
  }

  insert(values: Row[]): void {
    if (this.isCommitted) throw new Error("Can't insert after commit");

    for (const record of values) {
      const colValue = getHashIndexValue(
        record,
        this.originalIndex.indexDef.column,
      );
      if (colValue === undefined) continue;

      const rows = this.sets.get(colValue);

      if (!rows) {
        const m = new Map();
        m.set(record.id, record);
        this.sets.set(colValue, m);
      } else {
        rows.set(record.id, record);
      }
    }

    // Remove from deletes if previously deleted
    for (const record of values) {
      const colValue = getHashIndexValue(
        record,
        this.originalIndex.indexDef.column,
      );
      if (colValue === undefined) continue;

      const deletes = this.deletes.get(colValue);
      if (deletes) {
        deletes.delete(record.id);
      }
    }
  }

  delete(values: Row[]): void {
    if (this.isCommitted) throw new Error("Can't delete after commit");

    for (const record of values) {
      const colValue = getHashIndexValue(
        record,
        this.originalIndex.indexDef.column,
      );
      if (colValue === undefined) continue;

      // Remove from sets if it was added in this transaction
      const sets = this.sets.get(colValue);
      if (sets) {
        sets.delete(record.id);
      }

      // Add to deletes
      const deletes = this.deletes.get(colValue);
      if (!deletes) {
        const s = new Set<string>();
        s.add(record.id);
        this.deletes.set(colValue, s);
      } else {
        deletes.add(record.id);
      }
    }
  }
}

class BtreeIndexTx implements IndexTx {
  index: BtreeIndex;
  sets: InMemoryBinaryPlusTree<ScanValue[], Row>;
  deletes: InMemoryBinaryPlusTree<ScanValue[], Row>;
  isCommitted = false;
  type = "btree" as const;

  constructor(index: BtreeIndex) {
    this.index = index;
    this.sets = new InMemoryBinaryPlusTree<ScanValue[], Row>(
      10,
      20,
      index.compareKey,
    );
    this.deletes = new InMemoryBinaryPlusTree<ScanValue[], Row>(
      10,
      20,
      index.compareKey,
    );
  }

  scan(tupleBounds: TupleScanOptions[], selectOptions: SelectOptions): Row[] {
    if (this.isCommitted) throw new Error("Can't scan after commit");

    const deletedRowIds = new Set<string>();
    for (const bounds of tupleBounds) {
      for (const { value } of this.deletes.iterate(bounds)) {
        deletedRowIds.add(value.id);
      }
    }

    const originalIterators = createBtreeScanIterators(
      this.index.btree,
      tupleBounds,
      selectOptions,
    ).map((iterator) =>
      filterBtreeIterator(iterator, (row) => deletedRowIds.has(row.id)),
    );
    const setIterators = createBtreeScanIterators(
      this.sets,
      tupleBounds,
      selectOptions,
    );

    return mergeBtreeIterators(
      [...setIterators, ...originalIterators],
      selectOptions,
      this.index.compareKey,
    );
  }

  insert(values: Row[]): void {
    if (this.isCommitted) throw new Error("Can't insert after commit");

    for (const record of values) {
      const key = getIndexKey(
        record,
        this.index.indexDef.columns,
        this.index.indexDef.includeMissing,
      );
      if (!key) continue;

      this.sets.set(key, record);
    }

    for (const record of values) {
      const key = getIndexKey(
        record,
        this.index.indexDef.columns,
        this.index.indexDef.includeMissing,
      );
      if (!key) continue;

      this.deletes.delete(key);
    }
  }

  delete(values: Row[]): void {
    if (this.isCommitted) throw new Error("Can't delete after commit");

    for (const row of values) {
      const key = getIndexKey(
        row,
        this.index.indexDef.columns,
        this.index.indexDef.includeMissing,
      );
      if (!key) continue;

      this.sets.delete(key);
    }

    for (const row of values) {
      const key = getIndexKey(
        row,
        this.index.indexDef.columns,
        this.index.indexDef.includeMissing,
      );
      if (!key) continue;

      this.deletes.set(key, row);
    }
  }

  cols(): string[] {
    return this.index.indexDef.columns;
  }

  commit(): void {
    if (this.isCommitted) throw new Error("Can't scan after commit");

    this.isCommitted = true;

    for (const row of this.sets.list()) {
      this.index.btree.set(row.key, row.value);
    }
    for (const row of this.deletes.list()) {
      this.index.btree.delete(row.key);
    }
  }
}

class BtreeIndex implements Index {
  indexDef: BtreeIndexDef;
  btree: InMemoryBinaryPlusTree<ScanValue[], Row>;
  compareKey: (a: ScanValue[], b: ScanValue[]) => number;
  type = "btree" as const;

  constructor(indexConfig: BtreeIndexDef) {
    this.compareKey = indexConfig.includeMissing
      ? (compareStoredTuple as (a: ScanValue[], b: ScanValue[]) => number)
      : compareTuple;
    this.btree = new InMemoryBinaryPlusTree<ScanValue[], Row>(
      10,
      20,
      this.compareKey,
    );
    this.indexDef = indexConfig;
  }

  scan(tupleBounds: TupleScanOptions[], selectOptions: SelectOptions): Row[] {
    return scanBtree(this.btree, tupleBounds, selectOptions, this.compareKey);
  }

  insert(values: Row[]): void {
    for (const record of values) {
      const key = getIndexKey(
        record,
        this.indexDef.columns,
        this.indexDef.includeMissing,
      );
      if (!key) continue;

      this.btree.set(key, record);
    }
  }

  delete(values: Row[]): void {
    for (const row of values) {
      const key = getIndexKey(
        row,
        this.indexDef.columns,
        this.indexDef.includeMissing,
      );
      if (!key) continue;

      this.btree.delete(key);
    }
  }

  cols(): string[] {
    return this.indexDef.columns;
  }

  tx(): BtreeIndexTx {
    return new BtreeIndexTx(this);
  }
}

type TableName = string;

export class BptreeInmemDriverTx implements DBDriverTX {
  tblDatas: Map<TableName, TxTableData> = new Map();
  original: BptreeInmemDriver;
  onFinish: () => void;

  committed = false;
  rollbacked = false;

  constructor(driver: BptreeInmemDriver, onFinish: () => void) {
    this.original = driver;
    this.onFinish = onFinish;
  }

  *commit(): Generator<DBCmd, void> {
    this.throwIfDone();

    for (const [, table] of this.tblDatas) {
      for (const index of table.indexes.values()) {
        index.commit();
      }
    }

    this.committed = true;
    this.onFinish();
  }

  *rollback(): Generator<DBCmd, void> {
    this.throwIfDone();
    this.rollbacked = true;
    this.onFinish();
  }

  *intervalScan(
    table: string,
    indexName: string,
    clauses: WhereClause[],
    selectOptions: SelectOptions,
  ): Generator<DBCmd, unknown[]> {
    this.throwIfDone();

    return performScan(
      this.getOrCreateTableData(table),
      indexName,
      clauses,
      selectOptions,
    );
  }

  *insert(tableName: string, values: Row[]): Generator<DBCmd, void> {
    this.throwIfDone();

    // console.log("insert", tableName, values);
    const tableData = this.getOrCreateTableData(tableName);

    performInsert(tableData, values);
  }

  *upsert(tableName: string, values: Row[]): Generator<DBCmd, void> {
    this.throwIfDone();

    const tableData = this.getOrCreateTableData(tableName);

    // console.log("upsert", tableName, values);
    performUpsert(tableData, values);
  }

  *delete(tableName: string, values: string[]): Generator<DBCmd, void> {
    this.throwIfDone();

    // console.log("delete", tableName, values);
    performDelete(this.getOrCreateTableData(tableName), values);
  }

  throwIfDone() {
    if (this.committed) {
      throw new Error("Cannot modify a committed tx");
    }

    if (this.rollbacked) {
      throw new Error("Cannot modify a rollbacked tx");
    }
  }

  private getOrCreateTableData(tableName: string): TxTableData {
    const tblData = this.tblDatas.get(tableName);
    if (tblData) {
      return tblData;
    }

    const noTxTableData = this.original.tblDatas.get(tableName);
    if (!noTxTableData) {
      throw new Error(`Table ${tableName} not found`);
    }

    const indexes = new Map<string, IndexTx>();

    let idTxIndex: HashIndexTx | undefined;
    for (const [name, index] of noTxTableData.indexes) {
      const txIndex = index.tx();

      if (index === noTxTableData.idIndex) {
        idTxIndex = txIndex as HashIndexTx;
      }

      indexes.set(name, txIndex);
    }

    if (!idTxIndex) {
      throw new Error("Table must have one equal id index");
    }

    const data: TxTableData = {
      tableDef: noTxTableData.tableDef,
      idIndex: idTxIndex,
      indexes: indexes,
    };

    this.tblDatas.set(tableName, data);

    return data;
  }
}

export class BptreeInmemDriver implements DBDriver {
  tblDatas: Map<TableName, TableData> = new Map();
  private isInTransaction = false;

  constructor() {}

  *beginTx(): Generator<DBCmd, DBDriverTX> {
    if (this.isInTransaction) {
      throw new Error("can't run while transaction is in progress");
    }
    this.isInTransaction = true;

    return new BptreeInmemDriverTx(this, () => (this.isInTransaction = false));
  }

  *loadTables(tables: TableDefinition<any>[]): Generator<DBCmd, void> {
    for (const tableDef of tables) {
      assertSafeTableDefinition(tableDef);

      // this.tableDefinitions.set(tableDef.name, tableDef);
      const indexes: Map<string, Index> = new Map();

      for (const [indexName, indexDef] of Object.entries(tableDef.indexes)) {
        if (indexDef.type === "btree") {
          const cols = [...(indexDef.cols as string[])];
          if (cols[cols.length - 1] !== "id") {
            cols.push("id");
          }

          indexes.set(
            indexName,
            new BtreeIndex({
              name: indexName,
              columns: cols,
              includeMissing: isSchemalessTable(tableDef),
            }),
          );
        } else if (indexDef.type === "hash") {
          if (indexDef.cols.length !== 1) {
            throw new Error("Hash index must have exactly one column");
          }

          indexes.set(
            indexName,
            new HashIndex({
              name: indexName,
              column: indexDef.cols[0] as string,
            }),
          );
        } else {
          throw new Error("Invalid index type" + indexDef.type);
        }
      }

      let idIndex: HashIndex | undefined;
      for (const index of indexes.values()) {
        if (index instanceof HashIndex && index.indexDef.column === "id") {
          idIndex = index;
          break;
        }
      }

      if (!idIndex) {
        throw new Error("Table must have one hash id index");
      }

      this.tblDatas.set(tableDef.tableName, {
        idIndex: idIndex,
        indexes: indexes,
        tableDef: tableDef,
      });
    }
  }

  *upsert(tableName: string, values: Row[]): Generator<DBCmd, void> {
    if (this.isInTransaction) {
      throw new Error("can't run while transaction is in progress");
    }

    const tblData = this.tblDatas.get(tableName);
    if (!tblData) {
      throw new Error(`Table ${tableName} not found`);
    }

    performUpsert(tblData, values);
  }

  *insert(tableName: string, values: Row[]): Generator<DBCmd, void> {
    if (this.isInTransaction) {
      throw new Error("can't run while transaction is in progress");
    }

    const tblData = this.tblDatas.get(tableName);
    if (!tblData) {
      throw new Error(`Table ${tableName} not found`);
    }

    performInsert(tblData, values);
  }

  *delete(tableName: string, ids: string[]): Generator<DBCmd, void> {
    if (this.isInTransaction) {
      throw new Error("can't run while transaction is in progress");
    }

    const tblData = this.tblDatas.get(tableName);
    if (!tblData) {
      throw new Error(`Table ${tableName} not found`);
    }

    performDelete(tblData, ids);
  }

  *intervalScan(
    tableName: string,
    indexName: string,
    clauses: WhereClause[],
    selectOptions: SelectOptions,
  ): Generator<DBCmd, Row[]> {
    if (this.isInTransaction) {
      throw new Error("can't run while transaction is in progress");
    }

    const tableData = this.tblDatas.get(tableName);
    if (!tableData) {
      throw new Error(`Table ${tableName} not found`);
    }

    return performScan(tableData, indexName, clauses, selectOptions);
  }
}

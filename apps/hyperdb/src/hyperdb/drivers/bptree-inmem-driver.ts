/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  DBDriver,
  DBDriverTX,
  Row,
  ScanValue,
  SelectOptions,
  TupleScanOptions,
  WhereClause,
} from "../db";
import type { IndexDefinitions, TableDefinition } from "../table";
import { InMemoryBinaryPlusTree } from "../utils/bptree";
import { compareTuple } from "./tuple";
import { convertWhereToBound } from "../bounds";
import { orderedArray } from "../utils/ordered-array";

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
};

type HashIndexDef = {
  name: string;
  column: string;
};

const makeIndexKey = (row: Row, indexColumns: string[]): ScanValue[] => {
  return indexColumns.map((col) => row[col] as ScanValue);
};

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
  for (const id of ids) {
    const [record] = Array.from(
      tblData.idIndex.scan([{ lte: [id], gte: [id] }], {}),
    );
    if (record === undefined || record == null) continue;

    for (const index of tblData.indexes.values()) {
      index.delete([record]);
    }
  }
}

function performInsert(tblData: TableData | TxTableData, values: Row[]) {
  for (const index of tblData.indexes.values()) {
    index.insert(values);
  }
}

function performUpdate(tblData: TableData | TxTableData, records: Row[]) {
  performDelete(
    tblData,
    records.map((r) => r.id),
  );
  performInsert(tblData, records);
}

interface BaseIndex {
  type: "btree" | "hash";
  scan(
    tupleBounds: TupleScanOptions[],
    selectOptions: SelectOptions,
  ): Generator<Row>;
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
  const idxValues = new Set<string>();

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

    console.log("bound", bound, bound.lte?.[0] !== bound.gte?.[0]);
    if (
      (bound.lte && bound.lte.length !== 1) ||
      (bound.gte && bound.gte.length !== 1) ||
      !bound.lte ||
      !bound.gte
    ) {
      throw new Error(
        "Hash index should have exactly one equality condition for column '" +
          indexDef.column +
          "'",
      );
    }

    if (bound.lte?.[0] !== bound.gte?.[0]) {
      throw new Error(
        "Hash index should have the same equality condition for column '" +
          indexDef.column +
          "'",
      );
    }

    idxValues.add(bound.lte?.[0] as string);
  }

  return idxValues;
};

class HashIndex implements Index {
  type = "hash" as const;
  indexDef: HashIndexDef;
  records: Map<string, Map<string, Row>> = new Map();

  constructor(indexDef: HashIndexDef) {
    this.indexDef = indexDef;
  }

  cols(): string[] {
    return [this.indexDef.column];
  }

  *scan(
    tupleBounds: TupleScanOptions[],
    selectOptions: { limit?: number },
  ): Generator<Row> {
    const idxValues = getColumnValuesFromBounds(this.indexDef, tupleBounds);

    let totalCount = 0;
    for (const idxValue of idxValues) {
      const rows = this.records.get(idxValue);

      if (!rows) continue;

      for (const [, row] of rows) {
        yield row;

        totalCount++;

        if (
          selectOptions?.limit !== undefined &&
          totalCount >= selectOptions.limit
        ) {
          return;
        }
      }
    }
  }

  insert(values: Row[]): void {
    for (const record of values) {
      const colValue = record[this.indexDef.column] as string;
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
      const col = record[this.indexDef.column] as string;
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
type ColumnValue = string;
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
    this.isCommitted = true;
  }

  scan(
    tupleBounds: TupleScanOptions[],
    selectOptions: { limit?: number },
  ): Generator<Row> {
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

    // TODO: finish

    // 1. scan from the index
    // 2. scan from current hash on top
    // 3. delete all records that marked as deleted

    // return this.originalIndex.scan(tupleBounds, selectOptions);
  }

  insert(values: Row[]): void {
    if (this.isCommitted) throw new Error("Can't insert after commit");

    // TODO: implement
    // this.originalIndex.insert(values);
  }

  delete(values: Row[]): void {
    if (this.isCommitted) throw new Error("Can't delete after commit");

    // TODO: implement
    // this.originalIndex.delete(values);
  }
}

class BtreeIndexTx implements IndexTx {
  index: BtreeIndex;
  sets: InMemoryBinaryPlusTree<ScanValue[], Row>;
  deletes: InMemoryBinaryPlusTree<ScanValue[], Row>;
  isCommitted = false;
  type = "btree" as const;
  orderedArray: ReturnType<typeof orderedArray<Row, ScanValue[]>>;

  constructor(index: BtreeIndex) {
    this.orderedArray = orderedArray(
      (it: Row) => makeIndexKey(it, index.indexDef.columns),
      compareTuple,
    );
    this.index = index;
    this.sets = new InMemoryBinaryPlusTree<ScanValue[], Row>(
      100,
      200,
      compareTuple,
    );
    this.deletes = new InMemoryBinaryPlusTree<ScanValue[], Row>(
      100,
      200,
      compareTuple,
    );
  }

  *scan(tupleBounds: TupleScanOptions[], selectOptions: { limit: number }) {
    const results: Row[][] = [];
    for (const bounds of tupleBounds) {
      const sets = this.sets.list(bounds);
      const deletes = this.deletes.list(bounds);

      const limit =
        selectOptions?.limit !== undefined
          ? selectOptions.limit + deletes.length
          : undefined;

      const result = Array.from(
        this.index.scan([bounds], limit !== undefined ? { limit } : {}),
      );

      for (const item of sets) {
        this.orderedArray.insert(result, item.value);
      }

      for (const { key } of deletes) {
        this.orderedArray.remove(result, key);
      }

      results.push(result);
    }

    let totalCount = 0;
    for (const rows of results) {
      for (const row of rows) {
        yield row;

        totalCount++;

        if (
          selectOptions?.limit !== undefined &&
          totalCount >= selectOptions.limit
        ) {
          return;
        }
      }
    }
  }

  insert(values: Row[]): void {
    if (this.isCommitted) throw new Error("Can't insert after commit");

    for (const record of values) {
      this.sets.set(makeIndexKey(record, this.index.indexDef.columns), record);
    }

    for (const record of values) {
      this.deletes.delete(makeIndexKey(record, this.index.indexDef.columns));
    }
  }

  delete(values: Row[]): void {
    if (this.isCommitted) throw new Error("Can't delete after commit");

    for (const row of values) {
      this.sets.delete(makeIndexKey(row, this.index.indexDef.columns));
    }

    for (const row of values) {
      this.deletes.set(makeIndexKey(row, this.index.indexDef.columns), row);
    }
  }

  cols(): string[] {
    return this.index.indexDef.columns;
  }

  commit(): void {
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
  type = "btree" as const;

  constructor(indexConfig: BtreeIndexDef) {
    this.btree = new InMemoryBinaryPlusTree<ScanValue[], Row>(
      100,
      200,
      compareTuple,
    );
    this.indexDef = indexConfig;
  }

  *scan(tupleBounds: TupleScanOptions[], selectOptions: { limit?: number }) {
    let totalCount = 0;

    for (const bounds of tupleBounds) {
      const results = this.btree.list({
        ...bounds,
        limit:
          selectOptions?.limit !== undefined
            ? selectOptions.limit - totalCount
            : undefined,
      });

      for (const result of results) {
        yield result.value;
        totalCount++;

        if (
          selectOptions?.limit !== undefined &&
          totalCount >= selectOptions.limit
        ) {
          return;
        }
      }
    }
  }

  insert(values: Row[]): void {
    for (const record of values) {
      this.btree.set(makeIndexKey(record, this.indexDef.columns), record);
    }
  }

  delete(values: Row[]): void {
    for (const row of values) {
      this.btree.delete(makeIndexKey(row, this.indexDef.columns));
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

  committed = false;
  rollbacked = false;

  constructor(driver: BptreeInmemDriver) {
    this.original = driver;
  }

  commit(): void {
    this.committed = true;
    for (const [, table] of this.tblDatas) {
      for (const index of table.indexes.values()) {
        index.commit();
      }
    }
  }

  rollback(): void {
    this.rollbacked = true;

    // do nothing
  }

  intervalScan(
    table: string,
    indexName: string,
    clauses: WhereClause[],
    selectOptions: SelectOptions,
  ): Generator<unknown> | Generator<Promise<unknown>> {
    this.throwIfDone();

    return performScan(
      this.getOrCreateTableData(table),
      indexName,
      clauses,
      selectOptions,
    );
  }

  insert(tableName: string, values: Row[]): void {
    this.throwIfDone();

    const tableData = this.getOrCreateTableData(tableName);

    performInsert(tableData, values);
  }

  update(tableName: string, values: Row[]): void {
    this.throwIfDone();

    const tableData = this.getOrCreateTableData(tableName);

    performUpdate(tableData, values);
  }

  delete(tableName: string, values: string[]): void {
    this.throwIfDone();

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

  constructor() {}

  beginTx(): DBDriverTX {
    return new BptreeInmemDriverTx(this);
  }

  loadTables(tables: TableDefinition<any, IndexDefinitions<any>>[]): void {
    for (const tableDef of tables) {
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

  update(tableName: string, values: Row[]): void {
    const tblData = this.tblDatas.get(tableName);
    if (!tblData) {
      throw new Error(`Table ${tableName} not found`);
    }

    performUpdate(tblData, values);
  }

  insert(tableName: string, values: Row[]): void {
    const tblData = this.tblDatas.get(tableName);
    if (!tblData) {
      throw new Error(`Table ${tableName} not found`);
    }

    performInsert(tblData, values);
  }

  delete(tableName: string, ids: string[]): void {
    const tblData = this.tblDatas.get(tableName);
    if (!tblData) {
      throw new Error(`Table ${tableName} not found`);
    }

    performDelete(tblData, ids);
  }

  intervalScan(
    tableName: string,
    indexName: string,
    clauses: WhereClause[],
    selectOptions: SelectOptions,
  ): Generator<Row> {
    const tableData = this.tblDatas.get(tableName);
    if (!tableData) {
      throw new Error(`Table ${tableName} not found`);
    }

    return performScan(tableData, indexName, clauses, selectOptions);
  }
}

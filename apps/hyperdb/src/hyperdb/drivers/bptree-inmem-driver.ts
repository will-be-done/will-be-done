/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  DBDriver,
  Row,
  ScanValue,
  SelectOptions,
  WhereClause,
} from "../db";
import type { IndexDefinitions, TableDefinition } from "../table";
import { UnreachableError } from "../utils";
import { InMemoryBinaryPlusTree } from "../utils/bptree";
import { compareTuple } from "./tuple";
import { convertWhereToBound } from "../bounds";

type RangeIndex = {
  type: "btree";
  name: string;
  tree: InMemoryBinaryPlusTree<ScanValue[], Row>;
  columns: string[];
};

type EqualIndex = {
  type: "hash";
  name: string;
  column: string;
  records: Map<string, Row>;
};

type Index = RangeIndex | EqualIndex;

const makeIndexKey = (row: Row, indexColumns: string[]): ScanValue[] => {
  return indexColumns.map((col) => row[col] as ScanValue);
};

export class BptreeInmemDriver implements DBDriver {
  data = new Map<
    string,
    {
      indexes: Record<string, Index>;
      idIndexName: string;
    }
  >();

  constructor() {}

  loadTables(tables: TableDefinition<any, IndexDefinitions<any>>[]): void {
    for (const tableDef of tables) {
      // this.tableDefinitions.set(tableDef.name, tableDef);
      const indexes: Record<string, Index> = {};

      for (const [indexName, indexDef] of Object.entries(tableDef.indexes)) {
        if (indexDef.type === "btree") {
          const cols = [...(indexDef.cols as string[])];
          if (cols[cols.length - 1] !== "id") {
            cols.push("id");
          }

          indexes[indexName] = {
            type: "btree",
            name: indexName,
            tree: new InMemoryBinaryPlusTree<ScanValue[], Row>(
              100,
              200,
              compareTuple,
            ),
            columns: cols,
          };
        } else if (indexDef.type === "hash") {
          if (indexDef.cols.length !== 1) {
            throw new Error("Hash index must have exactly one column");
          }

          indexes[indexName] = {
            type: "hash",
            name: indexName,
            column: indexDef.cols[0] as string,
            records: new Map(),
          };
        } else {
          throw new Error("Invalid index type" + indexDef.type);
        }
      }
      const idIndex = Object.values(indexes).find(
        (index): index is EqualIndex =>
          index.type === "hash" && index.column === "id",
      );

      if (!idIndex) {
        throw new Error("Table must have one equal id index");
      }

      this.data.set(tableDef.tableName, {
        indexes: indexes,
        idIndexName: idIndex.name,
      });
    }
  }

  update(tableName: string, values: Row[]): void {
    const tblData = this.data.get(tableName);
    if (!tblData) {
      throw new Error(`Table ${tableName} not found`);
    }

    // TODO: improve it. No need to delete if index key is not changed. Here is a draft:
    // const toDeleteAndInsert: Row[] = [];
    //
    // for (const record of values) {
    //   const existing = tblData.records.get(record.id);
    //   if (!existing) {
    //     toDeleteAndInsert.push(record);
    //     continue;
    //   }
    //   const oldIndexKey = makeIndexKey(existing, tblData.indexes["id"].columns);
    //   const newIndexKey = makeIndexKey(record, tblData.indexes["id"].columns);
    //
    //   if (compareTuple(oldIndexKey, newIndexKey) === 0) {
    //     tblData.records.set(record.id, record);
    //   } else {
    //     toDeleteAndInsert.push(record);
    //   }
    // }

    this.delete(
      tableName,
      values.map((v) => v.id),
    );
    this.insert(tableName, values);
  }

  insert(tableName: string, values: Row[]): void {
    const tblData = this.data.get(tableName);
    if (!tblData) {
      throw new Error(`Table ${tableName} not found`);
    }

    for (const index of Object.values(tblData.indexes)) {
      if (index.type === "btree") {
        for (const record of values) {
          index.tree.set(makeIndexKey(record, index.columns), record);
        }
      } else if (index.type === "hash") {
        for (const record of values) {
          index.records.set(record.id, record);
        }
      } else {
        throw new UnreachableError(index);
      }
    }
  }

  delete(tableName: string, values: string[]): void {
    const tblData = this.data.get(tableName);
    if (!tblData) {
      throw new Error(`Table ${tableName} not found`);
    }

    for (const id of values) {
      const index = tblData.indexes[tblData.idIndexName];
      if (!index) throw new Error("Index not found");
      if (index.type !== "hash") throw new Error("ID index is not equal type");

      const record = index.records.get(id);
      if (!record) continue;

      for (const index of Object.values(tblData.indexes)) {
        if (index.type === "btree") {
          index.tree.delete(makeIndexKey(record, index.columns));
        } else if (index.type === "hash") {
          index.records.delete(id);
        }
      }
    }
  }

  *intervalScan(
    tableName: string,
    indexName: string,
    clauses: WhereClause[],
    selectOptions: SelectOptions,
  ): Generator<unknown> {
    const tableData = this.data.get(tableName);
    if (!tableData) {
      throw new Error(`Table ${tableName} not found`);
    }
    const index = tableData.indexes[indexName as string];

    if (!index)
      throw new Error(
        "Index not found: " + indexName + " for table: " + tableName,
      );

    let totalCount = 0;
    if (index.type === "hash") {
      // For hash indexes, we only support exact equality matches
      const ids = new Set<string>();

      for (const clause of clauses) {
        if (
          (clause.lte !== undefined && clause.lte.length > 0) ||
          (clause.gte !== undefined && clause.gte.length > 0) ||
          (clause.gt !== undefined && clause.gt.length > 0) ||
          (clause.lt !== undefined && clause.lt.length > 0)
        ) {
          throw new Error(
            "Hash index doesn't support range conditions for column '" +
              index.column +
              "'",
          );
        }

        if (clause.eq) {
          if (clause.eq.length > 1) {
            throw new Error(
              "Hash index doesn't support multiple equality conditions for column '" +
                index.column +
                "'",
            );
          }
          if (clause.eq.length === 0) {
            throw new Error(
              "Hash index doesn't support empty equality conditions for column '" +
                index.column +
                "'",
            );
          }

          ids.add(clause.eq[0].val as string);
        }
      }

      for (const id of ids) {
        if (!index.records.has(id)) {
          continue;
        }

        yield index.records.get(id);
        totalCount++;

        if (
          selectOptions.limit !== undefined &&
          totalCount >= selectOptions.limit
        ) {
          return;
        }
      }
    } else if (index.type === "btree") {
      // Convert WhereClause to btree bounds using the bounds utility
      const indexConfig = {
        type: "btree" as const,
        cols: index.columns,
      };

      const tupleBounds = convertWhereToBound(indexConfig, clauses);

      for (const bounds of tupleBounds) {
        const results = index.tree.list({
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
            selectOptions.limit !== undefined &&
            totalCount >= selectOptions.limit
          ) {
            return;
          }
        }
      }
    } else {
      throw new UnreachableError(index);
    }
  }

  // *equalScan(
  //   table: string,
  //   indexName: string,
  //   ids: string[],
  // ): Generator<unknown> {
  //   const tblData = this.data.get(table);
  //   if (!tblData) {
  //     throw new Error(`Table ${table} not found`);
  //   }
  //
  //   const index = tblData.indexes[indexName];
  //   if (!index)
  //     throw new Error("Index not found: " + indexName + " for table: " + table);
  //   if (index.type !== "equal") throw new Error("Equal index required");
  //
  //   for (const id of ids) {
  //     if (!index.records.has(id)) {
  //       continue;
  //     }
  //
  //     yield index.records.get(id);
  //   }
  // }
}

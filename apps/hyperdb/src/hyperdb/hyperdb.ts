type IndexValue = string | number | boolean | null;

interface ScanOptions {
  limit?: number;
  offset?: number;
}

type TableSchema = Record<string, any> & { id: string };
type IndexDefinition<T extends TableSchema> = {
  [K: string]: (keyof T)[];
};

interface TableDefinition<T extends TableSchema> {
  name: string;
  indexes: IndexDefinition<T>;
}

class BTreeNode<T> {
  keys: string[] = [];
  values: Set<T>[] = [];
  children: BTreeNode<T>[] = [];
  isLeaf: boolean = true;
  degree: number;

  constructor(degree: number) {
    this.degree = degree;
  }
}

class BTree<T extends TableSchema> {
  private root: BTreeNode<T>;
  private degree: number;
  private compareKeys: (a: string, b: string) => number;

  constructor(degree: number = 4, compareKeys?: (a: string, b: string) => number) {
    this.degree = degree;
    this.root = new BTreeNode<T>(degree);
    this.compareKeys = compareKeys || ((a, b) => a < b ? -1 : a > b ? 1 : 0);
  }

  insert(key: string, value: T): void {
    if (this.root.keys.length === 2 * this.degree - 1) {
      const newRoot = new BTreeNode<T>(this.degree);
      newRoot.isLeaf = false;
      newRoot.children.push(this.root);
      this.splitChild(newRoot, 0);
      this.root = newRoot;
    }
    this.insertNonFull(this.root, key, value);
  }

  private insertNonFull(node: BTreeNode<T>, key: string, value: T): void {
    let i = node.keys.length - 1;

    if (node.isLeaf) {
      while (i >= 0 && this.compareKeys(key, node.keys[i]) < 0) {
        i--;
      }

      if (i >= 0 && this.compareKeys(key, node.keys[i]) === 0) {
        node.values[i].add(value);
      } else {
        node.keys.splice(i + 1, 0, key);
        node.values.splice(i + 1, 0, new Set([value]));
      }
    } else {
      while (i >= 0 && this.compareKeys(key, node.keys[i]) < 0) {
        i--;
      }
      i++;

      if (node.children[i].keys.length === 2 * this.degree - 1) {
        this.splitChild(node, i);
        if (this.compareKeys(key, node.keys[i]) > 0) {
          i++;
        }
      }
      this.insertNonFull(node.children[i], key, value);
    }
  }

  private splitChild(parent: BTreeNode<T>, index: number): void {
    const fullChild = parent.children[index];
    const newChild = new BTreeNode<T>(this.degree);
    const mid = this.degree - 1;

    newChild.isLeaf = fullChild.isLeaf;
    newChild.keys = fullChild.keys.splice(mid + 1);
    newChild.values = fullChild.values.splice(mid + 1);

    if (!fullChild.isLeaf) {
      newChild.children = fullChild.children.splice(mid + 1);
    }

    parent.children.splice(index + 1, 0, newChild);
    parent.keys.splice(index, 0, fullChild.keys[mid]);
    parent.values.splice(index, 0, fullChild.values[mid]);

    fullChild.keys.splice(mid);
    fullChild.values.splice(mid);
  }

  search(key: string): Set<T> {
    return this.searchNode(this.root, key);
  }

  private searchNode(node: BTreeNode<T>, key: string): Set<T> {
    let i = 0;
    while (i < node.keys.length && this.compareKeys(key, node.keys[i]) > 0) {
      i++;
    }

    if (i < node.keys.length && this.compareKeys(key, node.keys[i]) === 0) {
      return node.values[i];
    }

    if (node.isLeaf) {
      return new Set();
    }

    return this.searchNode(node.children[i], key);
  }

  *scanAll(): Generator<T> {
    yield* this.scanNode(this.root);
  }

  private *scanNode(node: BTreeNode<T>): Generator<T> {
    if (node.isLeaf) {
      for (const valueSet of node.values) {
        for (const value of valueSet) {
          yield value;
        }
      }
    } else {
      for (let i = 0; i < node.keys.length; i++) {
        yield* this.scanNode(node.children[i]);
        for (const value of node.values[i]) {
          yield value;
        }
      }
      yield* this.scanNode(node.children[node.children.length - 1]);
    }
  }
}

class CompositeIndex<T extends TableSchema> {
  private btree: BTree<string>;
  private columns: (keyof T)[];

  constructor(columns: (keyof T)[]) {
    this.columns = columns;
    this.btree = new BTree<string>(4, this.compareCompositeKeys.bind(this));
  }

  private compareCompositeKeys(keyA: string, keyB: string): number {
    const valuesA = JSON.parse(keyA);
    const valuesB = JSON.parse(keyB);
    
    // Compare each column in order
    for (let i = 0; i < Math.min(valuesA.length, valuesB.length); i++) {
      const a = valuesA[i];
      const b = valuesB[i];
      
      // Handle null values - nulls come first
      if (a === null && b === null) continue;
      if (a === null) return -1;
      if (b === null) return 1;
      
      // Compare by type and value
      if (typeof a !== typeof b) {
        // Type ordering: null < boolean < number < string
        const typeOrder = { boolean: 0, number: 1, string: 2 };
        return typeOrder[typeof a] - typeOrder[typeof b];
      }
      
      if (a < b) return -1;
      if (a > b) return 1;
    }
    
    // If all compared columns are equal, compare by length
    return valuesA.length - valuesB.length;
  }

  private createKey(record: T): string {
    const values = this.columns.map((col) => record[col]);
    return JSON.stringify(values);
  }

  insert(record: T): void {
    const key = this.createKey(record);
    this.btree.insert(key, record.id);
  }

  delete(record: T): void {
    const key = this.createKey(record);
    const existingSet = this.btree.search(key);
    existingSet.delete(record.id);
  }

  scan(values: IndexValue[]): Set<string> {
    const key = JSON.stringify(values);
    return this.btree.search(key);
  }

  *scanIds(values: IndexValue[]): Generator<string> {
    const key = JSON.stringify(values);
    const idSet = this.btree.search(key);
    for (const id of idSet) {
      yield id;
    }
  }

  *scanAll(): Generator<string> {
    yield* this.btree.scanAll();
  }
}

export class HyperDB {
  private tables = new Map<string, any[]>();
  private indexes = new Map<string, Map<string, CompositeIndex<any>>>();

  constructor(tableDefinitions: TableDefinition<any>[]) {
    for (const tableDef of tableDefinitions) {
      this.tables.set(tableDef.name, []);

      const tableIndexes = new Map<string, CompositeIndex<any>>();
      
      // Always create an "ids" index for id lookups
      tableIndexes.set("ids", new CompositeIndex(["id"]));
      
      // Create other indexes
      for (const [indexName, columns] of Object.entries(tableDef.indexes)) {
        if (indexName !== "ids") {
          tableIndexes.set(indexName, new CompositeIndex(columns));
        }
      }
      this.indexes.set(tableDef.name, tableIndexes);
    }
  }

  insert<T extends TableSchema>(tableDef: TableDefinition<T>, record: T): void {
    const records = this.tables.get(tableDef.name);
    if (!records) {
      throw new Error(`Table ${tableDef.name} not found`);
    }

    records.push(record);

    const tableIndexes = this.indexes.get(tableDef.name);
    if (tableIndexes) {
      for (const index of tableIndexes.values()) {
        index.insert(record);
      }
    }
  }

  update<T extends TableSchema>(
    tableDef: TableDefinition<T>,
    predicate: (record: T) => boolean,
    updates: Partial<T>,
  ): number {
    const records = this.tables.get(tableDef.name);
    if (!records) {
      throw new Error(`Table ${tableDef.name} not found`);
    }

    const tableIndexes = this.indexes.get(tableDef.name);
    let updatedCount = 0;

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      if (predicate(record)) {
        // Remove from indexes before update
        if (tableIndexes) {
          for (const index of tableIndexes.values()) {
            index.delete(record);
          }
        }

        // Update record
        Object.assign(record, updates);

        // Re-add to indexes after update
        if (tableIndexes) {
          for (const index of tableIndexes.values()) {
            index.insert(record);
          }
        }

        updatedCount++;
      }
    }

    return updatedCount;
  }

  delete<T extends TableSchema>(
    tableDef: TableDefinition<T>,
    predicate: (record: T) => boolean,
  ): number {
    const records = this.tables.get(tableDef.name);
    if (!records) {
      throw new Error(`Table ${tableDef.name} not found`);
    }

    const tableIndexes = this.indexes.get(tableDef.name);
    let deletedCount = 0;

    for (let i = records.length - 1; i >= 0; i--) {
      const record = records[i];
      if (predicate(record)) {
        // Remove from indexes
        if (tableIndexes) {
          for (const index of tableIndexes.values()) {
            index.delete(record);
          }
        }

        // Remove from table
        records.splice(i, 1);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  *scan<T extends TableSchema>(
    tableDef: TableDefinition<T>,
    indexName: string,
    values: IndexValue[],
    options: ScanOptions = {},
  ): Generator<T> {
    const tableIndexes = this.indexes.get(tableDef.name);
    if (!tableIndexes) {
      throw new Error(`Table ${tableDef.name} not found`);
    }

    const index = tableIndexes.get(indexName);
    if (!index) {
      throw new Error(`Index ${indexName} not found on table ${tableDef.name}`);
    }

    const records = this.tables.get(tableDef.name);
    if (!records) {
      throw new Error(`Table ${tableDef.name} not found`);
    }

    let count = 0;
    const offset = options.offset || 0;
    const limit = options.limit;

    // Stream IDs and immediately look up records to avoid loading all IDs in memory
    for (const id of index.scanIds(values)) {
      if (count < offset) {
        count++;
        continue;
      }

      if (limit && count >= offset + limit) {
        break;
      }

      // Find the actual record in the table by ID
      const record = records.find((r: T) => r.id === id);
      if (record) {
        yield record;
      }
      count++;
    }
  }
}

export function table<T extends TableSchema>(
  name: string,
  indexes: IndexDefinition<T>,
): TableDefinition<T> {
  return { name, indexes };
}

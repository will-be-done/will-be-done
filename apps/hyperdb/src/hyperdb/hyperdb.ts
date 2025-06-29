type IndexValue = string | number | boolean | null;

interface ScanOptions {
  limit?: number;
  offset?: number;
}

type TableSchema = Record<string, any>;
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

  constructor(degree: number = 4) {
    this.degree = degree;
    this.root = new BTreeNode<T>(degree);
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
      while (i >= 0 && key < node.keys[i]) {
        i--;
      }

      if (i >= 0 && node.keys[i] === key) {
        node.values[i].add(value);
      } else {
        node.keys.splice(i + 1, 0, key);
        node.values.splice(i + 1, 0, new Set([value]));
      }
    } else {
      while (i >= 0 && key < node.keys[i]) {
        i--;
      }
      i++;

      if (node.children[i].keys.length === 2 * this.degree - 1) {
        this.splitChild(node, i);
        if (key > node.keys[i]) {
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
    while (i < node.keys.length && key > node.keys[i]) {
      i++;
    }

    if (i < node.keys.length && key === node.keys[i]) {
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
  private btree: BTree<T>;
  private columns: (keyof T)[];

  constructor(columns: (keyof T)[]) {
    this.columns = columns;
    this.btree = new BTree<T>();
  }

  private createKey(record: T): string {
    const values = this.columns.map((col) => record[col]);
    return JSON.stringify(values);
  }

  insert(record: T): void {
    const key = this.createKey(record);
    this.btree.insert(key, record);
  }

  delete(_record: T): void {
    // For simplicity, we'll implement a basic delete that rebuilds the index
    // A full implementation would need proper B-tree deletion
    console.warn("Delete operation not fully implemented for B-tree");
  }

  scan(values: IndexValue[]): Set<T> {
    const key = JSON.stringify(values);
    return this.btree.search(key);
  }

  *scanAll(): Generator<T> {
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
      for (const [indexName, columns] of Object.entries(tableDef.indexes)) {
        tableIndexes.set(indexName, new CompositeIndex(columns));
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

    const results = index.scan(values);
    let count = 0;
    const offset = options.offset || 0;
    const limit = options.limit;

    for (const record of results) {
      if (count < offset) {
        count++;
        continue;
      }

      if (limit && count >= offset + limit) {
        break;
      }

      yield record;
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

// Immutable HyperDB with transactions using structural sharing
// Based on persistent data structures principles

interface IndexValue {
  value: string | number | boolean | null;
  indexName: string;
  tupleIndex: number; // position in composite index
}

interface BTreeNode<T> {
  readonly id: string;
  readonly isLeaf: boolean;
  readonly keys: readonly string[];
  readonly values?: readonly T[]; // Only for leaf nodes
  readonly children?: readonly BTreeNode<T>[]; // Only for internal nodes
  readonly size: number; // number of records in this subtree
}

class ImmutableBTreeNode<T> implements BTreeNode<T> {
  constructor(
    public readonly id: string,
    public readonly isLeaf: boolean,
    public readonly keys: readonly string[],
    public readonly values: readonly T[] = [],
    public readonly children: readonly BTreeNode<T>[] = [],
    public readonly size: number = 0
  ) {}

  // Returns new node with inserted key/value
  insert(key: string, value: T, degree: number = 4): BTreeNode<T> {
    if (this.isLeaf) {
      return this.insertInLeaf(key, value);
    } else {
      return this.insertInInternal(key, value, degree);
    }
  }

  private insertInLeaf(key: string, value: T): BTreeNode<T> {
    const insertIndex = this.findInsertPosition(key);
    
    // Always insert - allows duplicates
    const newKeys = [...this.keys];
    const newValues = [...this.values];
    newKeys.splice(insertIndex, 0, key);
    newValues.splice(insertIndex, 0, value);

    return new ImmutableBTreeNode(
      generateNodeId(),
      this.isLeaf,
      newKeys,
      newValues,
      this.children,
      this.size + 1
    );
  }

  private insertInInternal(key: string, value: T, degree: number): BTreeNode<T> {
    const childIndex = this.findChildIndex(key);
    const newChild = this.children[childIndex].insert(key, value, degree);
    
    // If child didn't split, just update reference
    if (this.childFits(newChild, degree)) {
      const newChildren = [...this.children];
      newChildren[childIndex] = newChild;
      
      return new ImmutableBTreeNode(
        generateNodeId(),
        this.isLeaf,
        this.keys,
        this.values,
        newChildren,
        this.size + (newChild.size - this.children[childIndex].size)
      );
    }

    // Child split - need to handle promotion
    // For simplicity, we'll just return the updated child for now
    // Full B-tree splitting would be more complex
    const newChildren = [...this.children];
    newChildren[childIndex] = newChild;
    
    return new ImmutableBTreeNode(
      generateNodeId(),
      this.isLeaf,
      this.keys,
      this.values,
      newChildren,
      this.size + (newChild.size - this.children[childIndex].size)
    );
  }

  private findInsertPosition(key: string): number {
    let left = 0;
    let right = this.keys.length;
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (this.keys[mid] < key) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }
    return left;
  }

  private findChildIndex(key: string): number {
    for (let i = 0; i < this.keys.length; i++) {
      if (key <= this.keys[i]) {
        return i;
      }
    }
    return this.keys.length;
  }

  private childFits(child: BTreeNode<T>, degree: number): boolean {
    return child.keys.length <= degree * 2;
  }

  // Scan iterator
  *scan(options: {
    gte?: string;
    lte?: string;
    gt?: string;
    lt?: string;
    reverse?: boolean;
    limit?: number;
  } = {}): Generator<T> {
    if (this.isLeaf) {
      yield* this.scanLeaf(options);
    } else {
      yield* this.scanInternal(options);
    }
  }

  private *scanLeaf(options: any): Generator<T> {
    const indices = this.getLeafScanIndices(options);
    
    if (options.reverse) {
      for (let i = indices.end; i >= indices.start; i--) {
        yield this.values[i];
      }
    } else {
      for (let i = indices.start; i <= indices.end; i++) {
        yield this.values[i];
      }
    }
  }

  private *scanInternal(options: any): Generator<T> {
    // Scan children in order
    for (const child of this.children) {
      yield* child.scan(options);
    }
  }

  private getLeafScanIndices(options: any): { start: number; end: number } {
    let start = 0;
    let end = this.keys.length - 1;

    if (options.gte !== undefined) {
      start = this.findInsertPosition(options.gte);
    } else if (options.gt !== undefined) {
      start = this.findInsertPosition(options.gt);
      if (start < this.keys.length && this.keys[start] === options.gt) {
        start++;
      }
    }

    if (options.lte !== undefined) {
      end = this.findInsertPosition(options.lte);
      if (end < this.keys.length && this.keys[end] === options.lte) {
        // lte is inclusive
      } else {
        end--;
      }
    } else if (options.lt !== undefined) {
      end = this.findInsertPosition(options.lt) - 1;
    }

    return { start: Math.max(0, start), end: Math.min(this.keys.length - 1, end) };
  }
}

// Version represents an immutable snapshot of the database
class DatabaseVersion {
  constructor(
    public readonly versionId: number,
    public readonly indexes: ReadonlyMap<string, BTreeNode<any>>,
    public readonly timestamp: number = Date.now()
  ) {}

  // Create new version with updated index
  withUpdatedIndex<T>(indexName: string, newRoot: BTreeNode<T>): DatabaseVersion {
    const newIndexes = new Map(this.indexes);
    newIndexes.set(indexName, newRoot);
    
    return new DatabaseVersion(
      this.versionId, // Don't increment here - increment at commit time
      newIndexes,
      this.timestamp // Keep same timestamp during transaction
    );
  }

  // Create new version for commit
  withNewVersionId(): DatabaseVersion {
    return new DatabaseVersion(
      this.versionId + 1,
      this.indexes,
      Date.now()
    );
  }

  getIndex<T>(indexName: string): BTreeNode<T> | undefined {
    return this.indexes.get(indexName) as BTreeNode<T>;
  }
}

// Transaction provides a mutable interface over immutable versions
export class Transaction {
  private currentVersion: DatabaseVersion;
  private readonly operations: Array<{ type: string; indexName: string; key: string; value: any }> = [];

  constructor(baseVersion: DatabaseVersion) {
    this.currentVersion = baseVersion;
  }

  insert<T>(indexName: string, key: string, value: T): void {
    this.operations.push({ type: 'insert', indexName, key, value });
    
    const currentIndex = this.currentVersion.getIndex<T>(indexName);
    if (!currentIndex) {
      // Create new index
      const newRoot = new ImmutableBTreeNode<T>(
        generateNodeId(),
        true, // isLeaf
        [key],
        [value],
        [],
        1
      );
      this.currentVersion = this.currentVersion.withUpdatedIndex(indexName, newRoot);
    } else {
      // For primary indexes (ending with '_ids'), remove existing entries first
      if (indexName.endsWith('_ids')) {
        const newRoot = this.insertWithReplace(currentIndex, key, value);
        this.currentVersion = this.currentVersion.withUpdatedIndex(indexName, newRoot);
      } else {
        // For secondary indexes, always allow duplicates - just insert
        const newRoot = currentIndex.insert(key, value);
        this.currentVersion = this.currentVersion.withUpdatedIndex(indexName, newRoot);
      }
    }
  }

  private insertWithReplace<T>(index: BTreeNode<T>, key: string, value: T): BTreeNode<T> {
    // Remove any existing entries with this key first, then insert new one
    const filtered = this.removeByKey(index, key);
    return filtered.insert(key, value);
  }


  private removeByKey<T>(node: BTreeNode<T>, targetKey: string): BTreeNode<T> {
    if (node.isLeaf) {
      const newKeys: string[] = [];
      const newValues: T[] = [];
      let newSize = 0;

      for (let i = 0; i < node.keys.length; i++) {
        if (node.keys[i] !== targetKey) {
          newKeys.push(node.keys[i]);
          newValues.push(node.values![i]);
          newSize++;
        }
      }

      return new ImmutableBTreeNode(
        generateNodeId(),
        true,
        newKeys,
        newValues,
        [],
        newSize
      );
    } else {
      // For internal nodes, recursively remove from children
      const newChildren = node.children!.map(child => this.removeByKey(child, targetKey));
      const newSize = newChildren.reduce((sum, child) => sum + child.size, 0);

      return new ImmutableBTreeNode(
        generateNodeId(),
        false,
        node.keys,
        [],
        newChildren,
        newSize
      );
    }
  }

  *scan<T>(
    indexName: string,
    options: {
      gte?: string;
      lte?: string;
      gt?: string;
      lt?: string;
      reverse?: boolean;
      limit?: number;
    } = {}
  ): Generator<T> {
    const index = this.currentVersion.getIndex<T>(indexName);
    if (!index) {
      return;
    }

    let count = 0;
    for (const item of index.scan(options)) {
      if (options.limit && count >= options.limit) {
        break;
      }
      yield item;
      count++;
    }
  }

  // Get the final version (for commit)
  getVersion(): DatabaseVersion {
    return this.currentVersion;
  }

  // Get operation log (for debugging/auditing)
  getOperations(): readonly any[] {
    return this.operations;
  }
}

// Main immutable database class
export class ImmutableHyperDB {
  private currentVersion: DatabaseVersion;
  private versionHistory: DatabaseVersion[] = [];
  private readonly maxHistorySize: number;

  constructor(maxHistorySize: number = 10) {
    this.maxHistorySize = maxHistorySize;
    this.currentVersion = new DatabaseVersion(0, new Map());
    this.versionHistory.push(this.currentVersion);
  }

  // Start a new transaction
  beginTransaction(): Transaction {
    return new Transaction(this.currentVersion);
  }

  // Commit a transaction
  commit(transaction: Transaction): void {
    const transactionVersion = transaction.getVersion();
    const newVersion = transactionVersion.withNewVersionId();
    this.currentVersion = newVersion;
    
    // Add to history and cleanup old versions
    this.versionHistory.push(newVersion);
    if (this.versionHistory.length > this.maxHistorySize) {
      this.versionHistory.shift();
    }
  }

  // Rollback is implicit - just don't commit the transaction
  rollback(transaction: Transaction): void {
    // No-op - transaction is just discarded
    // The beauty of immutable structures!
  }

  // Read operations (can be done without transaction)
  *scan<T>(
    indexName: string,
    options: {
      gte?: string;
      lte?: string;
      gt?: string;
      lt?: string;
      reverse?: boolean;
      limit?: number;
    } = {}
  ): Generator<T> {
    const index = this.currentVersion.getIndex<T>(indexName);
    if (!index) {
      return;
    }

    let count = 0;
    for (const item of index.scan(options)) {
      if (options.limit && count >= options.limit) {
        break;
      }
      yield item;
      count++;
    }
  }

  // Get current version info
  getCurrentVersion(): { versionId: number; timestamp: number } {
    return {
      versionId: this.currentVersion.versionId,
      timestamp: this.currentVersion.timestamp
    };
  }

  // Get version history
  getVersionHistory(): Array<{ versionId: number; timestamp: number }> {
    return this.versionHistory.map(v => ({
      versionId: v.versionId,
      timestamp: v.timestamp
    }));
  }

  // Time travel - get snapshot at specific version
  getVersionSnapshot(versionId: number): DatabaseVersion | undefined {
    return this.versionHistory.find(v => v.versionId === versionId);
  }

  // Create read-only transaction from specific version
  beginTransactionFromVersion(versionId: number): Transaction | undefined {
    const version = this.getVersionSnapshot(versionId);
    return version ? new Transaction(version) : undefined;
  }
}

// Utility function to generate unique node IDs
let nodeIdCounter = 0;
function generateNodeId(): string {
  return `node_${++nodeIdCounter}_${Date.now()}`;
}

// Type-safe table interface
export interface TableDefinition<T> {
  name: string;
  indexes: Record<string, (keyof T)[]>;
}

export function table<T>(
  name: string,
  indexes: Record<string, (keyof T)[]>
): TableDefinition<T> {
  return { name, indexes };
}

// Higher-level API that combines multiple indexes per table
export class TypedImmutableHyperDB {
  private db = new ImmutableHyperDB();
  private tableDefinitions = new Map<string, TableDefinition<any>>();

  registerTable<T>(tableDef: TableDefinition<T>): void {
    this.tableDefinitions.set(tableDef.name, tableDef);
  }

  beginTransaction(): TypedTransaction {
    return new TypedTransaction(this.db.beginTransaction(), this.tableDefinitions);
  }

  commit(transaction: TypedTransaction): void {
    this.db.commit(transaction.getInternalTransaction());
  }

  rollback(transaction: TypedTransaction): void {
    this.db.rollback(transaction.getInternalTransaction());
  }

  *scan<T>(
    tableDef: TableDefinition<T>,
    indexName: string,
    options: {
      gte?: any[];
      lte?: any[];
      gt?: any[];
      lt?: any[];
      reverse?: boolean;
      limit?: number;
    } = {}
  ): Generator<T> {
    const fullIndexName = `${tableDef.name}_${indexName}`;
    
    // Convert tuple options to string keys
    const stringOptions = {
      gte: options.gte ? this.tupleToKey(options.gte) : undefined,
      lte: options.lte ? this.tupleToKey(options.lte) : undefined,
      gt: options.gt ? this.tupleToKey(options.gt) : undefined,
      lt: options.lt ? this.tupleToKey(options.lt) : undefined,
      reverse: options.reverse,
      limit: options.limit
    };

    yield* this.db.scan<T>(fullIndexName, stringOptions);
  }

  private tupleToKey(tuple: any[]): string {
    return tuple.map(v => String(v)).join('\x00');
  }
}

export class TypedTransaction {
  constructor(
    private transaction: Transaction,
    private tableDefinitions: ReadonlyMap<string, TableDefinition<any>>
  ) {}

  insert<T>(tableDef: TableDefinition<T>, record: T & { id: string }): void {
    // Insert into all indexes for this table
    for (const [indexName, columns] of Object.entries(tableDef.indexes)) {
      const fullIndexName = `${tableDef.name}_${indexName}`;
      const key = this.buildIndexKey(record, columns);
      this.transaction.insert(fullIndexName, key, record);
    }

    // Always insert into primary index (by id)
    const primaryIndexName = `${tableDef.name}_ids`;
    this.transaction.insert(primaryIndexName, record.id, record);
  }

  *scan<T>(
    tableDef: TableDefinition<T>,
    indexName: string,
    options: {
      gte?: any[];
      lte?: any[];
      gt?: any[];
      lt?: any[];
      reverse?: boolean;
      limit?: number;
    } = {}
  ): Generator<T> {
    const fullIndexName = `${tableDef.name}_${indexName}`;
    
    const stringOptions = {
      gte: options.gte ? this.tupleToKey(options.gte) : undefined,
      lte: options.lte ? this.tupleToKey(options.lte) : undefined,
      gt: options.gt ? this.tupleToKey(options.gt) : undefined,
      lt: options.lt ? this.tupleToKey(options.lt) : undefined,
      reverse: options.reverse,
      limit: options.limit
    };

    yield* this.transaction.scan<T>(fullIndexName, stringOptions);
  }

  getInternalTransaction(): Transaction {
    return this.transaction;
  }

  private buildIndexKey<T>(record: T, columns: (keyof T)[]): string {
    return columns.map(col => String(record[col])).join('\x00');
  }

  private tupleToKey(tuple: any[]): string {
    return tuple.map(v => String(v)).join('\x00');
  }
}
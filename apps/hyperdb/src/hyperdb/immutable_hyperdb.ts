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
  private readonly operations: Array<{ type: string; tableName: string; record: any }> = [];
  private readonly tableDefinitions: Map<string, TableDefinition<any>>;

  constructor(baseVersion: DatabaseVersion, tableDefinitions: Map<string, TableDefinition<any>>) {
    this.currentVersion = baseVersion;
    this.tableDefinitions = tableDefinitions;
  }

  insert<T extends { id: string }>(tableName: string, record: T): void {
    this.operations.push({ type: 'insert', tableName, record });
    
    const tableDef = this.tableDefinitions.get(tableName);
    if (!tableDef) {
      throw new Error(`Table ${tableName} not found`);
    }

    // Remove old record from all indexes if it exists (for updates)
    const existingRecord = this.getRecordById(tableName, record.id);
    if (existingRecord) {
      this.removeFromAllIndexes(tableDef, existingRecord);
    }

    // Insert new record into all indexes
    this.insertIntoAllIndexes(tableDef, record);
  }

  private getRecordById<T>(tableName: string, id: string): T | null {
    const primaryIndexName = `${tableName}_ids`;
    const primaryIndex = this.currentVersion.getIndex<T>(primaryIndexName);
    if (!primaryIndex) return null;

    // Scan for the specific ID
    for (const record of primaryIndex.scan({ gte: id, lte: id })) {
      if ((record as any).id === id) {
        return record;
      }
    }
    return null;
  }

  private removeFromAllIndexes<T>(tableDef: TableDefinition<T>, record: T & { id: string }): void {
    // Remove from primary index
    const primaryIndexName = `${tableDef.name}_ids`;
    const primaryIndex = this.currentVersion.getIndex<T>(primaryIndexName);
    if (primaryIndex) {
      const newPrimaryIndex = this.removeByKey(primaryIndex, record.id);
      this.currentVersion = this.currentVersion.withUpdatedIndex(primaryIndexName, newPrimaryIndex);
    }

    // Remove from all secondary indexes
    for (const [indexName, columns] of Object.entries(tableDef.indexes)) {
      const fullIndexName = `${tableDef.name}_${indexName}`;
      const index = this.currentVersion.getIndex<T>(fullIndexName);
      if (index) {
        const key = this.buildIndexKey(record, columns, true); // Include ID for secondary indexes
        // For secondary indexes, we can now remove by unique key
        const newIndex = this.removeByKey(index, key);
        this.currentVersion = this.currentVersion.withUpdatedIndex(fullIndexName, newIndex);
      }
    }
  }

  private insertIntoAllIndexes<T>(tableDef: TableDefinition<T>, record: T & { id: string }): void {
    // Insert into primary index (unique by ID)
    const primaryIndexName = `${tableDef.name}_ids`;
    let primaryIndex = this.currentVersion.getIndex<T>(primaryIndexName);
    if (!primaryIndex) {
      primaryIndex = new ImmutableBTreeNode<T>(
        generateNodeId(),
        true,
        [],
        [],
        [],
        0
      );
    }
    const newPrimaryIndex = primaryIndex.insert(record.id, record);
    this.currentVersion = this.currentVersion.withUpdatedIndex(primaryIndexName, newPrimaryIndex);

    // Insert into all secondary indexes (allow duplicates)
    for (const [indexName, columns] of Object.entries(tableDef.indexes)) {
      const fullIndexName = `${tableDef.name}_${indexName}`;
      let index = this.currentVersion.getIndex<T>(fullIndexName);
      if (!index) {
        index = new ImmutableBTreeNode<T>(
          generateNodeId(),
          true,
          [],
          [],
          [],
          0
        );
      }
      const key = this.buildIndexKey(record, columns, true); // Include ID for secondary indexes
      const newIndex = index.insert(key, record);
      this.currentVersion = this.currentVersion.withUpdatedIndex(fullIndexName, newIndex);
    }
  }

  private buildIndexKey<T>(record: T, columns: (keyof T)[], includeId: boolean = false): string {
    const keyParts = columns.map(col => String(record[col]));
    if (includeId && (record as any).id) {
      keyParts.push(String((record as any).id));
    }
    return keyParts.join('\x00');
  }

  private removeSpecificRecord<T>(node: BTreeNode<T>, targetKey: string, targetRecord: T): BTreeNode<T> {
    if (node.isLeaf) {
      const newKeys: string[] = [];
      const newValues: T[] = [];
      let newSize = 0;

      for (let i = 0; i < node.keys.length; i++) {
        // Only remove if both key and record match (for secondary indexes with duplicates)
        if (node.keys[i] !== targetKey || !this.recordsEqual(node.values![i], targetRecord)) {
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
      const newChildren = node.children!.map(child => this.removeSpecificRecord(child, targetKey, targetRecord));
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

  private recordsEqual<T>(a: T, b: T): boolean {
    // Simple equality check - in a real implementation you might want something more sophisticated
    return JSON.stringify(a) === JSON.stringify(b);
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
    tableName: string,
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
    const tableDef = this.tableDefinitions.get(tableName);
    if (!tableDef) {
      throw new Error(`Table ${tableName} not found`);
    }

    const fullIndexName = indexName === 'ids' ? `${tableName}_ids` : `${tableName}_${indexName}`;
    const index = this.currentVersion.getIndex<T>(fullIndexName);
    if (!index) {
      return;
    }

    // Convert tuple options to string keys
    const stringOptions = {
      gte: options.gte ? this.tupleToKey(options.gte) : undefined,
      lte: options.lte ? this.tupleToKey(options.lte) : undefined,
      gt: options.gt ? this.tupleToKey(options.gt) : undefined,
      lt: options.lt ? this.tupleToKey(options.lt) : undefined,
      reverse: options.reverse,
      limit: options.limit
    };

    let count = 0;
    for (const item of index.scan(stringOptions)) {
      if (options.limit && count >= options.limit) {
        break;
      }
      yield item;
      count++;
    }
  }

  private tupleToKey(tuple: any[]): string {
    return tuple.map(v => this.encodeValue(v)).join('\x00');
  }

  private encodeValue(value: any): string {
    return String(value);
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
  private readonly tableDefinitions = new Map<string, TableDefinition<any>>();
  private activeTransaction: Transaction | null = null;

  constructor(maxHistorySize: number = 10) {
    this.maxHistorySize = maxHistorySize;
    this.currentVersion = new DatabaseVersion(0, new Map());
    this.versionHistory.push(this.currentVersion);
  }

  // Register a table schema
  registerTable<T>(tableDef: TableDefinition<T>): void {
    this.tableDefinitions.set(tableDef.name, tableDef);
  }

  // Start a new transaction
  beginTransaction(): Transaction {
    if (this.activeTransaction) {
      throw new Error("Another transaction is already active. Only one transaction allowed at a time.");
    }
    this.activeTransaction = new Transaction(this.currentVersion, this.tableDefinitions);
    return this.activeTransaction;
  }

  // Commit a transaction
  commit(transaction: Transaction): void {
    if (this.activeTransaction !== transaction) {
      throw new Error("Cannot commit transaction that is not the active transaction");
    }
    
    const transactionVersion = transaction.getVersion();
    const newVersion = transactionVersion.withNewVersionId();
    this.currentVersion = newVersion;
    
    // Add to history and cleanup old versions
    this.versionHistory.push(newVersion);
    if (this.versionHistory.length > this.maxHistorySize) {
      this.versionHistory.shift();
    }
    
    // Clear active transaction
    this.activeTransaction = null;
  }

  // Rollback is implicit - just don't commit the transaction
  rollback(transaction: Transaction): void {
    if (this.activeTransaction === transaction) {
      this.activeTransaction = null;
    }
    // No-op - transaction is just discarded
    // The beauty of immutable structures!
  }

  // Read operations (can be done without transaction)
  *scan<T>(
    tableName: string,
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
    const tableDef = this.tableDefinitions.get(tableName);
    if (!tableDef) {
      throw new Error(`Table ${tableName} not found`);
    }

    const fullIndexName = indexName === 'ids' ? `${tableName}_ids` : `${tableName}_${indexName}`;
    const index = this.currentVersion.getIndex<T>(fullIndexName);
    if (!index) {
      return;
    }

    // Convert tuple options to string keys
    // For secondary indexes, we need to handle the fact that keys include record ID
    const isSecondaryIndex = indexName !== 'ids';
    let stringOptions;
    
    if (isSecondaryIndex) {
      // For secondary indexes, we use prefix matching since keys have ID appended
      const gtePrefix = options.gte ? this.tupleToKey(options.gte) : undefined;
      const ltePrefix = options.lte ? this.tupleToKey(options.lte) : undefined;
      
      stringOptions = {
        gte: gtePrefix,
        lte: ltePrefix ? ltePrefix + '\xFF' : undefined, // \xFF is greater than any ID
        gt: options.gt ? this.tupleToKey(options.gt) : undefined,
        lt: options.lt ? this.tupleToKey(options.lt) + '\xFF' : undefined,
        reverse: options.reverse,
        limit: options.limit
      };
    } else {
      // Primary index uses exact keys
      stringOptions = {
        gte: options.gte ? this.tupleToKey(options.gte) : undefined,
        lte: options.lte ? this.tupleToKey(options.lte) : undefined,
        gt: options.gt ? this.tupleToKey(options.gt) : undefined,
        lt: options.lt ? this.tupleToKey(options.lt) : undefined,
        reverse: options.reverse,
        limit: options.limit
      };
    }

    let count = 0;
    for (const item of index.scan(stringOptions)) {
      if (options.limit && count >= options.limit) {
        break;
      }
      yield item;
      count++;
    }
  }

  private tupleToKey(tuple: any[]): string {
    return tuple.map(v => this.encodeValue(v)).join('\x00');
  }

  private encodeValue(value: any): string {
    return String(value);
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
    return version ? new Transaction(version, this.tableDefinitions) : undefined;
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

// Type alias for the main database - now it's all unified
export { ImmutableHyperDB as TypedImmutableHyperDB };
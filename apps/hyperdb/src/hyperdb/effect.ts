// Effect types
type Effect<T> = T | Promise<T>;
type EffectGenerator<T> = Generator<Effect<any>, T, any>;

// Cursor interface - stateful iterator
interface Cursor<T> {
  advance(): Effect<boolean>; // Returns true if there's a next item
  value: T; // Current value (undefined if no current item)
  done: boolean; // Whether cursor is exhausted
}

// Database with cursor-based scanning
interface CursorDB {
  scan<T>(index: Index<T>): Effect<Cursor<T>>;
  insert<T>(table: Table<T>, record: T): Effect<void>;
}

// Table and index types
interface Table<T> {
  name: string;
  idx: Record<string, Index<T>>;
}

interface Index<T> {
  name: string;
  table: Table<T>;
}

// Sync cursor implementation
class SyncCursor<T> implements Cursor<T> {
  private iterator: Iterator<T>;
  private current: IteratorResult<T>;

  constructor(private data: T[]) {
    this.iterator = data[Symbol.iterator]();
    this.current = { done: true, value: undefined as any };
  }

  advance(): boolean {
    this.current = this.iterator.next();
    return !this.current.done;
  }

  get value(): T {
    return this.current.value;
  }

  get done(): boolean {
    return this.current.done;
  }
}

// Async cursor implementation
class AsyncCursor<T> implements Cursor<T> {
  private iterator: AsyncIterator<T>;
  private current: IteratorResult<T>;

  constructor(private asyncData: AsyncIterator<T>) {
    this.iterator = asyncData;
    this.current = { done: true, value: undefined as any };
  }

  async advance(): Promise<boolean> {
    // Simulate async delay
    await new Promise((resolve) => setTimeout(resolve, 10));
    this.current = await this.iterator.next();
    return !this.current.done;
  }

  get value(): T {
    return this.current.value;
  }

  get done(): boolean {
    return this.current.done;
  }
}

// Sync database implementation
class SyncCursorDB implements CursorDB {
  private data = new Map<string, any[]>();

  constructor(tables: Table<any>[]) {
    tables.forEach((table) => {
      this.data.set(table.name, []);
    });
  }

  scan<T>(index: Index<T>): SyncCursor<T> {
    const tableData = this.data.get(index.table.name) || [];
    return new SyncCursor(tableData);
  }

  insert<T>(table: Table<T>, record: T): void {
    if (!this.data.has(table.name)) {
      this.data.set(table.name, []);
    }
    this.data.get(table.name)!.push(record);
  }
}

// Async database implementation
class AsyncCursorDB implements CursorDB {
  async scan<T>(index: Index<T>): Promise<AsyncCursor<T>> {
    // Create async iterator
    const asyncIterator = this.createAsyncIterator<T>();
    return new AsyncCursor(asyncIterator);
  }

  private async *createAsyncIterator<T>(): AsyncIterator<T> {
    const mockData = [
      { id: "1", title: "Task 1", state: "todo", projectId: "1" },
      { id: "2", title: "Task 2", state: "done", projectId: "1" },
      { id: "3", title: "Task 3", state: "done", projectId: "1" },
    ] as T[];

    for (const item of mockData) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      yield item;
    }
  }

  async insert<T>(table: Table<T>, record: T): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

// Your exact pattern!
function* doneChildrenIds(
  db: CursorDB,
  tasksTable: Table<Task>,
  projectId: string,
  alwaysIncludeTaskIds: string[],
): EffectGenerator<string[]> {
  const result: string[] = [];

  // Your exact syntax
  const iterate = function* () {
    const q: Cursor<Task> = yield* effect(db.scan(tasksTable.idx.done));
    while (yield* effect(q.advance())) {
      yield q.value;
    }
  };

  // Direct usage with yield* effect() pattern (your preferred style)
  const cursor: Cursor<Task> = yield* effect(db.scan(tasksTable.idx.done));
  while (yield* effect(cursor.advance())) {
    const task = cursor.value;

    if (task.state === "done" || alwaysIncludeTaskIds.includes(task.id)) {
      result.push(task.id);
    }
  }

  return result;
}

// Alternative: Direct usage without the nested generator
function* doneChildrenIdsDirect(
  db: CursorDB,
  tasksTable: Table<Task>,
  projectId: string,
  alwaysIncludeTaskIds: string[],
): EffectGenerator<string[]> {
  const result: string[] = [];

  // Direct cursor usage
  const cursor: Cursor<Task> = yield db.scan(tasksTable.idx.done);

  while (yield cursor.advance()) {
    const task = cursor.value;

    if (task.state === "done" || alwaysIncludeTaskIds.includes(task.id)) {
      result.push(task.id);
    }

    // Could break early based on conditions
    // if (result.length >= 10) break;
  }

  return result;
}

// Your preferred syntax with yield* effect() pattern
function* doneChildrenIdsWithYieldStar(
  db: CursorDB,
  tasksTable: Table<Task>,
  projectId: string,
  alwaysIncludeTaskIds: string[],
): EffectGenerator<string[]> {
  const result: string[] = [];

  // Direct usage of yield* effect() - this is the cleanest approach
  const cursor: Cursor<Task> = yield* effect(db.scan(tasksTable.idx.done));
  while (yield* effect(cursor.advance())) {
    const task = cursor.value;

    if (task.state === "done" || alwaysIncludeTaskIds.includes(task.id)) {
      result.push(task.id);
    }
  }

  return result;
}

// Enhanced cursor with additional methods
interface EnhancedCursor<T> extends Cursor<T> {
  peek(): Effect<T | undefined>; // Look at next without advancing
  skip(count: number): Effect<number>; // Skip N items, return actual skipped
  remaining(): Effect<number>; // Get remaining count (if known)
}

function* advancedIteration(
  db: CursorDB,
  tasksTable: Table<Task>,
): EffectGenerator<void> {
  const cursor: Cursor<Task> = yield db.scan(tasksTable.idx.done);

  // Skip first 5 items
  // yield cursor.skip(5);

  let count = 0;
  while (yield cursor.advance()) {
    const task = cursor.value;
    console.log(`Item ${count++}: ${task.id}`);

    // Could peek at next item
    // const next = yield* [cursor.peek()];
    // if (next?.state === "done") { ... }
  }
}

// Helper to make effects work with yield*
function* effect<T>(value: Effect<T>): EffectGenerator<T> {
  return yield value;
}

// Runner functions (from previous examples)
function run<T>(gen: EffectGenerator<T>): Effect<T> {
  function step(gen: EffectGenerator<T>, value?: any): Effect<T> {
    const { value: effect, done } = gen.next(value);

    if (done) {
      return effect as T;
    }

    if (effect && typeof effect.then === "function") {
      return effect.then((result: any) => step(gen, result)) as Promise<T>;
    } else {
      return step(gen, effect);
    }
  }

  return step(gen);
}

async function runAsync<T>(gen: EffectGenerator<T>): Promise<T> {
  function step(value?: any): Promise<T> {
    const { value: effect, done } = gen.next(value);

    if (done) {
      return Promise.resolve(effect as T);
    }

    return Promise.resolve(effect).then(step);
  }

  return step();
}

// Helper to create tables with indexes
function createTable<T>(name: string): Table<T> {
  const table: Table<T> = {
    name,
    idx: {},
  };

  // Add indexes
  table.idx.done = { name: "done", table };
  table.idx.project = { name: "project", table };

  return table;
}

export {
  type CursorDB,
  SyncCursorDB,
  AsyncCursorDB,
  type Cursor,
  type EnhancedCursor,
  effect,
  doneChildrenIds,
  doneChildrenIdsDirect,
  doneChildrenIdsWithYieldStar,
  advancedIteration,
  createTable,
  run,
  runAsync,
};

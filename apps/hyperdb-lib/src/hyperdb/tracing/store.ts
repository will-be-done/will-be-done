import type { QueryWhereClause } from "../commands/query/commands";
import type { TupleScanOptions, Value } from "../core/primitives";

export type TraceKind = "action" | "selector" | "unknown";
export type TraceStatus = "running" | "success" | "error";
export type CommandEventKind = "select";
export type MutationEventKind = "insert" | "upsert" | "delete";

export type TraceError = {
  name?: string;
  message: string;
  stack?: string;
};

export type TraceFrameMeta = {
  id: string;
  kind: TraceKind;
  name: string;
  args: unknown[];
};

export type TraceFrame = {
  id: string;
  parentId?: string;
  kind: TraceKind;
  name: string;
  args: unknown[];
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  status: TraceStatus;
  error?: TraceError;
  children: TraceFrame[];
  commandIds: string[];
  mutationIds: string[];
};

export type SelectCommandEvent = {
  id: string;
  frameId: string;
  kind: CommandEventKind;
  tableName: string;
  index: string;
  where: QueryWhereClause[];
  bounds: TupleScanOptions[];
  limit?: number;
  order?: string;
  resultCount?: number;
  result?: unknown[];
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  status: TraceStatus;
  error?: TraceError;
};

export type MutationEvent = {
  id: string;
  frameId: string;
  kind: MutationEventKind;
  tableName: string;
  rows?: unknown[];
  ids?: string[];
  oldValue?: unknown[];
  newValue?: unknown[];
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  status: TraceStatus;
  error?: TraceError;
};

export type RootTrace = {
  id: string;
  kind: TraceKind;
  name: string;
  args: unknown[];
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  status: TraceStatus;
  error?: TraceError;
  frames: TraceFrame[];
  commandEvents: SelectCommandEvent[];
  mutationEvents: MutationEvent[];
};

export type SerializedValue = {
  text: string;
  value: unknown;
};

type TraceListener = () => void;

let idCounter = 0;

const nextId = (prefix: string): string => {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
};

const wallClockNow = (): number => Date.now();

export const summarizeError = (error: unknown): TraceError => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: typeof error === "string" ? error : safeSerialize(error).text,
  };
};

export const safeSerialize = (value: unknown): SerializedValue => {
  const seen = new WeakSet<object>();

  try {
    const json = JSON.stringify(
      value,
      (_key, currentValue: unknown) => {
        if (typeof currentValue === "bigint") {
          return `${currentValue.toString()}n`;
        }

        if (typeof currentValue === "function") {
          return `[Function ${(currentValue as { name?: string }).name || "anonymous"}]`;
        }

        if (typeof currentValue === "symbol") {
          return String(currentValue);
        }

        if (typeof currentValue === "object" && currentValue !== null) {
          if (seen.has(currentValue)) {
            return "[Circular]";
          }
          seen.add(currentValue);
        }

        return currentValue;
      },
      2,
    );

    return { text: json ?? String(value), value };
  } catch (error) {
    return {
      text: `[Unserializable: ${summarizeError(error).message}]`,
      value,
    };
  }
};

export class HyperDBTraceStore {
  private traces: RootTrace[] = [];
  private listeners = new Set<TraceListener>();
  private activeListenerCount = 0;
  private maxTraces: number;

  constructor(maxTraces = 200) {
    this.maxTraces = maxTraces;
  }

  subscribe = (listener: TraceListener): (() => void) => {
    this.listeners.add(listener);
    this.activeListenerCount += 1;

    return () => {
      if (this.listeners.delete(listener)) {
        this.activeListenerCount -= 1;
      }
    };
  };

  getSnapshot = (): RootTrace[] => this.traces;

  getListenerCount = (): number => this.activeListenerCount;

  isActive = (): boolean => this.activeListenerCount > 0;

  setMaxTraces = (maxTraces: number): void => {
    const n = Number(maxTraces);
    if (!Number.isFinite(n)) return;

    const nextMaxTraces = Math.max(1, Math.floor(n));
    if (nextMaxTraces === this.maxTraces) return;

    this.maxTraces = nextMaxTraces;
    this.trim();
    this.notify();
  };

  clear = (): void => {
    this.traces = [];
    this.notify();
  };

  addTrace = (trace: RootTrace): void => {
    this.traces = [trace, ...this.traces];
    this.trim();
    this.notify();
  };

  notify = (): void => {
    for (const listener of this.listeners) {
      listener();
    }
  };

  private trim(): void {
    if (this.traces.length <= this.maxTraces) return;
    this.traces = this.traces.slice(0, this.maxTraces);
  }
}

export const hyperDBTraceStore = new HyperDBTraceStore();

export type TraceContext = {
  trace: RootTrace;
  rootFrame: TraceFrame;
  frameStack: TraceFrame[];
  frameMetas: TraceFrameMeta[];
  rootMetaId?: string;
  store: HyperDBTraceStore;
};

export const createTraceFrameMeta = (
  kind: TraceKind,
  name: string,
  args: unknown[],
): TraceFrameMeta => ({
  id: nextId("meta"),
  kind,
  name,
  args,
});

const createFrame = (
  meta: TraceFrameMeta,
  startedAt: number,
  parentId?: string,
): TraceFrame => ({
  id: nextId("frame"),
  parentId,
  kind: meta.kind,
  name: meta.name,
  args: meta.args,
  startedAt,
  status: "running",
  children: [],
  commandIds: [],
  mutationIds: [],
});

const finishDuration = (startedAt: number): number =>
  Math.max(0, wallClockNow() - startedAt);

const finishFrame = (
  frame: TraceFrame,
  status: Exclude<TraceStatus, "running">,
  error?: unknown,
): void => {
  if (frame.status !== "running") return;
  frame.endedAt = wallClockNow();
  frame.durationMs = finishDuration(frame.startedAt);
  frame.status = status;
  if (error !== undefined) {
    frame.error = summarizeError(error);
  }
};

export const startRootTrace = (
  meta: TraceFrameMeta,
  store = hyperDBTraceStore,
): TraceContext | undefined => {
  if (!store.isActive()) return undefined;

  const startedAt = wallClockNow();
  const rootFrame = createFrame(meta, startedAt);
  const trace: RootTrace = {
    id: nextId("trace"),
    kind: meta.kind,
    name: meta.name,
    args: meta.args,
    startedAt,
    status: "running",
    frames: [rootFrame],
    commandEvents: [],
    mutationEvents: [],
  };

  const context: TraceContext = {
    trace,
    rootFrame,
    frameStack: [rootFrame],
    frameMetas: [meta],
    rootMetaId: meta.id,
    store,
  };

  store.addTrace(trace);
  return context;
};

const sameMeta = (left: TraceFrameMeta, right: TraceFrameMeta): boolean =>
  left.id === right.id;

export const enterFramePath = (
  context: TraceContext,
  path: TraceFrameMeta[] | undefined,
): TraceFrame => {
  // yield* hides delegated generator boundaries from the runner. Child frames
  // therefore close when command ownership returns to an ancestor, or when the
  // root trace ends, which is the closest reliable timing available here.
  const normalizedPath =
    path && path.length > 0
      ? path[0]?.id === context.rootMetaId
        ? path
        : [context.frameMetas[0]!, ...path]
      : [context.frameMetas[0]!];

  let sharedLength = 0;
  while (
    sharedLength < context.frameMetas.length &&
    sharedLength < normalizedPath.length &&
    sameMeta(context.frameMetas[sharedLength]!, normalizedPath[sharedLength]!)
  ) {
    sharedLength += 1;
  }

  while (context.frameStack.length > sharedLength) {
    const frame = context.frameStack.pop()!;
    context.frameMetas.pop();
    finishFrame(frame, "success");
  }

  for (let i = sharedLength; i < normalizedPath.length; i++) {
    const meta = normalizedPath[i]!;
    const parent = context.frameStack[context.frameStack.length - 1]!;
    const frame = createFrame(meta, wallClockNow(), parent.id);
    parent.children.push(frame);
    context.frameStack.push(frame);
    context.frameMetas.push(meta);
  }

  return context.frameStack[context.frameStack.length - 1]!;
};

export const getCurrentTraceFrame = (context: TraceContext): TraceFrame =>
  context.frameStack[context.frameStack.length - 1]!;

export const endTraceSuccess = (context: TraceContext): void => {
  enterFramePath(context, undefined);
  finishFrame(context.rootFrame, "success");
  context.trace.endedAt = context.rootFrame.endedAt;
  context.trace.durationMs = context.rootFrame.durationMs;
  context.trace.status = "success";
  context.store.notify();
};

export const endTraceError = (
  context: TraceContext,
  error: unknown,
): void => {
  while (context.frameStack.length > 0) {
    const frame = context.frameStack.pop()!;
    context.frameMetas.pop();
    finishFrame(frame, "error", error);
  }

  context.trace.endedAt = wallClockNow();
  context.trace.durationMs = finishDuration(context.trace.startedAt);
  context.trace.status = "error";
  context.trace.error = summarizeError(error);
  context.store.notify();
};

export const beginSelectEvent = (
  context: TraceContext,
  frame: TraceFrame,
  input: {
    tableName: string;
    index: string;
    where: QueryWhereClause[];
    bounds: TupleScanOptions[];
    limit?: number;
    order?: string;
  },
): SelectCommandEvent => {
  const event: SelectCommandEvent = {
    id: nextId("cmd"),
    frameId: frame.id,
    kind: "select",
    tableName: input.tableName,
    index: input.index,
    where: input.where,
    bounds: input.bounds,
    limit: input.limit,
    order: input.order,
    startedAt: wallClockNow(),
    status: "running",
  };
  frame.commandIds.push(event.id);
  context.trace.commandEvents.push(event);
  context.store.notify();
  return event;
};

export const endSelectEventSuccess = (
  context: TraceContext,
  event: SelectCommandEvent,
  result: unknown[],
): void => {
  event.endedAt = wallClockNow();
  event.durationMs = finishDuration(event.startedAt);
  event.resultCount = result.length;
  event.result = result;
  event.status = "success";
  context.store.notify();
};

export const endSelectEventError = (
  context: TraceContext,
  event: SelectCommandEvent,
  error: unknown,
): void => {
  event.endedAt = wallClockNow();
  event.durationMs = finishDuration(event.startedAt);
  event.status = "error";
  event.error = summarizeError(error);
  context.store.notify();
};

export const beginMutationEvent = (
  context: TraceContext,
  frame: TraceFrame,
  input: {
    kind: MutationEventKind;
    tableName: string;
    rows?: unknown[];
    ids?: string[];
    oldValue?: unknown[];
    newValue?: unknown[];
  },
): MutationEvent => {
  const event: MutationEvent = {
    id: nextId("mutation"),
    frameId: frame.id,
    kind: input.kind,
    tableName: input.tableName,
    rows: input.rows,
    ids: input.ids,
    oldValue: input.oldValue,
    newValue: input.newValue,
    startedAt: wallClockNow(),
    status: "running",
  };
  frame.mutationIds.push(event.id);
  context.trace.mutationEvents.push(event);
  context.store.notify();
  return event;
};

export const endMutationEventSuccess = (
  context: TraceContext,
  event: MutationEvent,
  patch: Partial<Pick<MutationEvent, "rows" | "ids" | "oldValue" | "newValue">> = {},
): void => {
  Object.assign(event, patch);
  event.endedAt = wallClockNow();
  event.durationMs = finishDuration(event.startedAt);
  event.status = "success";
  context.store.notify();
};

export const endMutationEventError = (
  context: TraceContext,
  event: MutationEvent,
  error: unknown,
): void => {
  event.endedAt = wallClockNow();
  event.durationMs = finishDuration(event.startedAt);
  event.status = "error";
  event.error = summarizeError(error);
  context.store.notify();
};

export const anonymousTraceMeta = (): TraceFrameMeta =>
  createTraceFrameMeta("unknown", "anonymous", []);

export type SerializableTraceValue = string | number | boolean | null | Value;

import {
  createTraceFrameMeta,
  type TraceFrameMeta,
  type TraceKind,
} from "./store";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const generatorTraceMetaKey = Symbol.for(
  "hyperdb.devtool.generatorMeta",
);

const commandFramePath = new WeakMap<object, TraceFrameMeta[]>();

export type TraceableGenerator<TReturn = unknown> = Generator<
  unknown,
  TReturn,
  unknown
> & {
  [generatorTraceMetaKey]?: TraceFrameMeta;
};

export const getGeneratorTraceMeta = (
  gen: Generator<unknown, unknown, unknown>,
): TraceFrameMeta | undefined =>
  (gen as TraceableGenerator)[generatorTraceMetaKey];

export const getCommandFramePath = (
  cmd: unknown,
): TraceFrameMeta[] | undefined => {
  if (typeof cmd !== "object" || cmd === null) return undefined;
  return commandFramePath.get(cmd);
};

const annotateCommand = (
  cmd: unknown,
  meta: TraceFrameMeta,
): unknown => {
  if (typeof cmd !== "object" || cmd === null) return cmd;

  const existingPath = commandFramePath.get(cmd);
  if (existingPath?.[0]?.id === meta.id) {
    return cmd;
  }

  commandFramePath.set(cmd, [meta, ...(existingPath ?? [])]);
  return cmd;
};

export const wrapGeneratorWithTraceMeta = <TReturn>(
  gen: Generator<unknown, TReturn, unknown>,
  kind: TraceKind,
  name: string,
  args: unknown[],
): Generator<unknown, TReturn, unknown> => {
  const meta = createTraceFrameMeta(kind, name, args);

  function* tracedGenerator(): Generator<unknown, TReturn, unknown> {
    let sentValue: unknown;
    let result: IteratorResult<unknown, TReturn>;

    try {
      result = gen.next();
    } catch (error) {
      throw error;
    }

    while (!result.done) {
      try {
        sentValue = yield annotateCommand(result.value, meta);
        result = gen.next(sentValue);
      } catch (error) {
        if (!gen.throw) throw error;
        result = gen.throw(error);
      }
    }

    return result.value;
  }

  const traced = tracedGenerator() as TraceableGenerator<TReturn>;
  Object.defineProperty(traced, generatorTraceMetaKey, {
    value: meta,
    enumerable: false,
    configurable: false,
  });

  return traced;
};

export const isGeneratorFunction = (fn: unknown): boolean => {
  if (typeof fn !== "function") return false;
  return fn.constructor?.name === "GeneratorFunction";
};

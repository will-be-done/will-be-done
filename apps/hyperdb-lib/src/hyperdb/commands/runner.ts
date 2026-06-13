import {
  isDeleteActionCmd,
  isGetCurrentTraitsCmd,
  isInsertActionCmd,
  isUpsertActionCmd,
} from "./action/commands";
import type { HyperDB } from "../core/contracts";
import { isNoopCmd, isUnwrapCmd, type DBCmd } from "./async";
import { isSelectRangeCmd, type SelectRangeCmd } from "./query/commands";
import { withTraceContextTrait } from "../tracing/context";
import {
  getCommandFramePath,
  getGeneratorTraceMeta,
} from "../tracing/metadata";
import {
  anonymousTraceMeta,
  beginSelectEvent,
  endSelectEventError,
  endSelectEventSuccess,
  endTraceError,
  endTraceSuccess,
  enterFramePath,
  startRootTrace,
  type TraceContext,
} from "../tracing/store";

export type CommandRunnerOptions = {
  allowWrites?: boolean;
  selectRangeCmds?: SelectRangeCmd[];
  traceContext?: TraceContext;
};

const isDBCmd = (cmd: unknown): cmd is DBCmd =>
  cmd instanceof Object && cmd !== null && (isUnwrapCmd(cmd) || isNoopCmd(cmd));

const describeUnsupportedCommand = (cmd: unknown) => {
  if (cmd instanceof Object && cmd !== null && "type" in cmd) {
    return `type "${String((cmd as { type: unknown }).type)}"`;
  }

  try {
    return JSON.stringify(cmd);
  } catch {
    return String(cmd);
  }
};

export function* runCommandGenerator<TReturn>(
  db: HyperDB,
  gen: Generator<unknown, TReturn, unknown>,
  options: CommandRunnerOptions = {},
): Generator<DBCmd, TReturn, unknown> {
  const traceContext =
    options.traceContext ??
    startRootTrace(getGeneratorTraceMeta(gen) ?? anonymousTraceMeta());
  const ownsTraceContext = traceContext !== undefined && !options.traceContext;
  const scopedDB = traceContext ? withTraceContextTrait(db, traceContext) : db;

  try {
    let result = gen.next();

    while (!result.done) {
      const cmd = result.value;
      const traceFrame = traceContext
        ? enterFramePath(traceContext, getCommandFramePath(cmd))
        : undefined;

      if (isSelectRangeCmd(cmd)) {
        const { table, index, selectQuery } = cmd;

        options.selectRangeCmds?.push(cmd);
        const selectEvent =
          traceContext && traceFrame
            ? beginSelectEvent(traceContext, traceFrame, {
                tableName: table.tableName,
                index,
                where: selectQuery.where,
                bounds: cmd.bounds,
                limit: selectQuery.limit,
                order: selectQuery.order,
              })
            : undefined;

        try {
          const rows = yield* scopedDB.intervalScan(
            table,
            index,
            selectQuery.where,
            {
              limit: selectQuery.limit,
              order: selectQuery.order,
            },
          );
          if (traceContext && selectEvent) {
            endSelectEventSuccess(traceContext, selectEvent, rows);
          }
          result = gen.next(rows);
        } catch (error) {
          if (traceContext && selectEvent) {
            endSelectEventError(traceContext, selectEvent, error);
          }
          throw error;
        }
      } else if (isInsertActionCmd(cmd)) {
        if (!options.allowWrites) {
          throw new Error("Writes are disallowed for command: insert");
        }

        result = gen.next(yield* scopedDB.insert(cmd.table, cmd.values));
      } else if (isUpsertActionCmd(cmd)) {
        if (!options.allowWrites) {
          throw new Error("Writes are disallowed for command: upsert");
        }

        result = gen.next(yield* scopedDB.upsert(cmd.table, cmd.values));
      } else if (isDeleteActionCmd(cmd)) {
        if (!options.allowWrites) {
          throw new Error("Writes are disallowed for command: delete");
        }

        result = gen.next(yield* scopedDB.delete(cmd.table, cmd.values));
      } else if (isGetCurrentTraitsCmd(cmd)) {
        result = gen.next(scopedDB.getTraits());
      } else if (isDBCmd(cmd)) {
        result = gen.next(yield cmd);
      } else {
        throw new Error(
          `Unsupported command: ${describeUnsupportedCommand(cmd)}`,
        );
      }
    }

    if (ownsTraceContext) {
      endTraceSuccess(traceContext);
    }

    return result.value;
  } catch (error) {
    if (ownsTraceContext) {
      endTraceError(traceContext, error);
    }

    console.error(error);

    throw error;
  }
}

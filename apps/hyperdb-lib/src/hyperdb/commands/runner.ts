import {
  isDeleteActionCmd,
  isGetCurrentTraitsCmd,
  isInsertActionCmd,
  isUpsertActionCmd,
} from "./action/commands";
import type { HyperDB } from "../core/contracts";
import { isNoopCmd, isUnwrapCmd, type DBCmd } from "./async";
import { isSelectRangeCmd, type SelectRangeCmd } from "./query/commands";

export type CommandRunnerOptions = {
  allowWrites?: boolean;
  selectRangeCmds?: SelectRangeCmd[];
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
  let result = gen.next();

  while (!result.done) {
    const cmd = result.value;

    if (isSelectRangeCmd(cmd)) {
      const { table, index, selectQuery } = cmd;

      options.selectRangeCmds?.push(cmd);
      result = gen.next(
        yield* db.intervalScan(table, index, selectQuery.where, {
          limit: selectQuery.limit,
          order: selectQuery.order,
        }),
      );
    } else if (isInsertActionCmd(cmd)) {
      if (!options.allowWrites) {
        throw new Error("Writes are disallowed for command: insert");
      }

      result = gen.next(yield* db.insert(cmd.table, cmd.values));
    } else if (isUpsertActionCmd(cmd)) {
      if (!options.allowWrites) {
        throw new Error("Writes are disallowed for command: upsert");
      }

      result = gen.next(yield* db.upsert(cmd.table, cmd.values));
    } else if (isDeleteActionCmd(cmd)) {
      if (!options.allowWrites) {
        throw new Error("Writes are disallowed for command: delete");
      }

      result = gen.next(yield* db.delete(cmd.table, cmd.values));
    } else if (isGetCurrentTraitsCmd(cmd)) {
      result = gen.next(db.getTraits());
    } else if (isDBCmd(cmd)) {
      result = gen.next(yield cmd);
    } else {
      throw new Error(
        `Unsupported command: ${describeUnsupportedCommand(cmd)}`,
      );
    }
  }

  return result.value;
}

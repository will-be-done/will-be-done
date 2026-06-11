import {
  isDeleteActionCmd,
  isGetCurrentTraitsCmd,
  isInsertActionCmd,
  isUpdateActionCmd,
} from "./action-commands";
import type { HyperDB } from "./db";
import { isNoopCmd, isUnwrapCmd, type DBCmd } from "./generators";
import { isSelectRangeCmd, type SelectRangeCmd } from "./selector-commands";

type CommandRunnerOptions = {
  allowWrites?: boolean;
  selectRangeCmds?: SelectRangeCmd[];
};

const isDBCmd = (cmd: unknown): cmd is DBCmd =>
  cmd instanceof Object &&
  cmd !== null &&
  (isUnwrapCmd(cmd) || isNoopCmd(cmd));

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
    } else if (options.allowWrites && isInsertActionCmd(cmd)) {
      result = gen.next(yield* db.insert(cmd.table, cmd.values));
    } else if (options.allowWrites && isUpdateActionCmd(cmd)) {
      result = gen.next(yield* db.update(cmd.table, cmd.values));
    } else if (options.allowWrites && isDeleteActionCmd(cmd)) {
      result = gen.next(yield* db.delete(cmd.table, cmd.values));
    } else if (isGetCurrentTraitsCmd(cmd)) {
      result = gen.next(db.getTraits());
    } else if (isDBCmd(cmd)) {
      result = gen.next(yield cmd);
    } else {
      result = gen.next();
    }
  }

  return result.value;
}

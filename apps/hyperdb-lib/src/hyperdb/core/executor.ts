import { isNoopCmd, isUnwrapCmd, type DBCmd } from "../commands/async";

function unexpectedCmdError(cmd: unknown): Error {
  return new Error(`Unexpected DBCmd yielded: ${String(cmd)}`);
}

export function execSync<T>(cmd: Generator<DBCmd, T>): T {
  let result = cmd.next();

  while (!result.done) {
    if (isUnwrapCmd(result.value)) {
      throw new Error("Cannot execute async commands");
    } else if (isNoopCmd(result.value)) {
      result = cmd.next();
    } else {
      throw unexpectedCmdError(result.value);
    }
  }

  return result.value as T;
}

export async function execAsync<T>(cmd: Generator<DBCmd, T>): Promise<T> {
  let result = cmd.next();

  while (!result.done) {
    if (isUnwrapCmd(result.value)) {
      result = cmd.next(await result.value.data);
    } else if (isNoopCmd(result.value)) {
      result = cmd.next();
    } else {
      throw unexpectedCmdError(result.value);
    }
  }

  return result.value as T;
}

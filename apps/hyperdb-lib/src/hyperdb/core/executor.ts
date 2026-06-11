import { isNoopCmd, isUnwrapCmd, type DBCmd } from "../commands/async";

export function execSync<T>(cmd: Generator<DBCmd, T>): T {
  let result = cmd.next();

  while (!result.done) {
    if (isUnwrapCmd(result.value)) {
      throw new Error("Cannot execute async commands");
    } else if (isNoopCmd(result.value)) {
      result = cmd.next();
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
    }
  }

  return result.value as T;
}

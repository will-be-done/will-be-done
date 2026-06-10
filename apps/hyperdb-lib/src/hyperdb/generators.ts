/* eslint-disable @typescript-eslint/no-explicit-any */
const unwrapType = "unwrap";
const noopType = "noop";
type NoopCmd = { type: typeof noopType };
type UnwrapCmd = { type: typeof unwrapType; data: unknown | Promise<unknown> };
export type DBCmd = UnwrapCmd | NoopCmd;

export function* unwrap<T>(data: Promise<T>): Generator<DBCmd, T, unknown> {
  return (yield {
    type: unwrapType,
    data: data,
  } satisfies UnwrapCmd) as T;
}

export function* unwrapCb<T>(
  data: () => Promise<T>,
): Generator<DBCmd, T, unknown> {
  return (yield {
    type: unwrapType,
    data: data(),
  } satisfies UnwrapCmd) as T;
}

export function* noop(): Generator<DBCmd, void, unknown> {
  return (yield {
    type: noopType,
  } satisfies NoopCmd) as void;
}

export const isUnwrapCmd = (cmd: unknown): cmd is UnwrapCmd =>
  cmd instanceof Object && cmd !== null && (cmd as any).type === unwrapType;

export const isCmd = (cmd: unknown): cmd is UnwrapCmd | any => isUnwrapCmd(cmd);
export const isNoopCmd = (cmd: any): cmd is NoopCmd => cmd.type === noopType;

// export function* collectAll<T>(
//   gen: Generator<T, unknown, unknown>,
// ): Generator<unknown, T[]> {
//   const currentGen = gen;
//   let currentResult = gen.next();
//
//   const result: T[] = [];
//   while (!currentResult.done) {
//     if (isCmd(currentResult.value)) {
//       const res = yield currentResult.value;
//
//       currentResult = currentGen.next(res);
//     } else {
//       result.push(currentResult.value);
//       currentResult = currentGen.next();
//     }
//   }
//   result.push(currentResult.value as T);
//
//   return result;
// }

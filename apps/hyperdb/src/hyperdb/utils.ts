export class UnreachableError extends Error {
  constructor(obj: never, message?: string) {
    super((message + ": " || "Unreachable: ") + obj);
  }
}

export type RefVar<T> = { val: T };
export const refVar = <T>(val: T): RefVar<T> => ({
  val,
});

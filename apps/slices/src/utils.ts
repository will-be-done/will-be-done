import { generateJitteredKeyBetween } from "fractional-indexing-jittered";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const shouldNeverHappen = (msg?: string, ...args: any[]): never => {
  console.error(msg, ...args);
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-debugger
    debugger;
  }
  throw new Error(`This should never happen: ${msg}`);
};

export function assertUnreachable(x: never): never {
  throw new Error("Didn't expect to get here");
}

export interface OrderableItem {
  id: string;
  orderToken: string;
}

export const generateKeyPositionedBetween = (
  current: OrderableItem,
  siblings: [OrderableItem | undefined, OrderableItem | undefined],
  position: "before" | "after",
) => {
  const [up, down] = siblings;

  let between: [OrderableItem | undefined, OrderableItem | undefined] = [
    up,
    current,
  ];
  if (position === "after") {
    between = [current, down] as const;
  }
  const orderToken = generateJitteredKeyBetween(
    between[0]?.orderToken || null,
    between[1]?.orderToken || null,
  );

  return orderToken;
};

export const isObjectType =
  <T>(type: string) =>
  (p: unknown): p is T => {
    return typeof p == "object" && p !== null && "type" in p && p.type === type;
  };

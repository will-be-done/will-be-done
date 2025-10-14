import { generateJitteredKeyBetween } from "fractional-indexing-jittered";

// Utility types
export type OrderableItem = {
  orderToken: string;
};

export type GenReturn<T> = Generator<unknown, T, unknown>;

// Utility functions
export function timeCompare(
  a: { lastToggledAt: number },
  b: { lastToggledAt: number },
): number {
  return b.lastToggledAt - a.lastToggledAt;
}

export function* generateOrderTokenPositioned(
  parentId: string,
  current: {
    lastChild(parentId: string): GenReturn<OrderableItem | undefined>;
    firstChild(parentId: string): GenReturn<OrderableItem | undefined>;
  },
  position:
    | [OrderableItem | undefined, OrderableItem | undefined]
    | "append"
    | "prepend",
) {
  if (position === "append") {
    return generateJitteredKeyBetween(
      (yield* current.lastChild(parentId))?.orderToken || null,
      null,
    );
  }

  if (position === "prepend") {
    return generateJitteredKeyBetween(
      null,
      (yield* current.firstChild(parentId))?.orderToken || null,
    );
  }

  return generateJitteredKeyBetween(
    position[0]?.orderToken || null,
    position[1]?.orderToken || null,
  );
}

export const inboxId = "01965eb2-7d13-727f-9f50-3d565d0ce2ef";

export function getDMY(date: Date): string {
  return date.toISOString().split("T")[0]!;
}

export function generateKeyPositionedBetween(
  item: OrderableItem,
  siblings: [OrderableItem | undefined, OrderableItem | undefined],
  position: "before" | "after",
): string {
  const [before, after] = siblings;

  if (position === "before") {
    return generateJitteredKeyBetween(
      before?.orderToken || null,
      item.orderToken,
    );
  } else {
    return generateJitteredKeyBetween(
      item.orderToken,
      after?.orderToken || null,
    );
  }
}

export function assertUnreachable(x: never): never {
  throw new Error("Unreachable code reached: " + x);
}

import { format, parse } from "date-fns";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import { v } from "@will-be-done/hyperdb";

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

export const dailyDateFormat = "yyyy-MM-dd";

export function getDMY(date: Date): string {
  return format(date, dailyDateFormat);
}

export function parseDMY(dateStr: string): Date {
  return parse(dateStr, dailyDateFormat, new Date());
}

export function generateKeyPositionedBetween(
  item: OrderableItem,
  siblings: [OrderableItem | undefined, OrderableItem | undefined],
  position: "before" | "after",
): string {
  const [before, after] = siblings;

  if (position === "before") {
    return generateJitteredKeyBetween(
      before && before.orderToken < item.orderToken ? before.orderToken : null,
      item.orderToken,
    );
  } else {
    return generateJitteredKeyBetween(
      item.orderToken,
      after && after.orderToken > item.orderToken ? after.orderToken : null,
    );
  }
}

export function assertUnreachable(x: never): never {
  throw new Error("Unreachable code reached: " + x);
}

const orderPositionPairArg = v.array(
  v.union(v.object({ orderToken: v.string() }), v.null()),
);

export const orderPositionArg = v.union(
  v.literal("append"),
  v.literal("prepend"),
  {
    ...orderPositionPairArg,
    normalize(value, path = []) {
      const result = orderPositionPairArg.normalize(value, path);
      if (result.ok && !result.omitted && result.value.length !== 2) {
        return {
          ok: false,
          message: "expected array of length 2",
          path,
        };
      }
      return result;
    },
  },
);

export type OrderPositionArg = "append" | "prepend" | (OrderableItem | null)[];

export const normalizeOrderPosition = <T extends OrderableItem>(
  position: OrderPositionArg,
): "append" | "prepend" | [T | undefined, T | undefined] => {
  if (position === "append" || position === "prepend") return position;
  return [position[0] ?? undefined, position[1] ?? undefined] as [
    T | undefined,
    T | undefined,
  ];
};

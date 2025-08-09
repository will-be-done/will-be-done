import { generateJitteredKeyBetween } from "fractional-indexing-jittered";

import type { RootState } from "@/store/store.ts";

export const generateOrderTokenPositioned = (
  state: RootState,
  parentId: string,
  current: {
    lastChild(state: RootState, parentId: string): OrderableItem | undefined;
    firstChild(state: RootState, parentId: string): OrderableItem | undefined;
  },
  position:
    | [OrderableItem | undefined, OrderableItem | undefined]
    | "append"
    | "prepend",
) => {
  if (position === "append") {
    return generateJitteredKeyBetween(
      current.lastChild(state, parentId)?.orderToken || null,
      null,
    );
  }

  if (position === "prepend") {
    return generateJitteredKeyBetween(
      null,
      current.firstChild(state, parentId)?.orderToken || null,
    );
  }

  return generateJitteredKeyBetween(
    position[0]?.orderToken || null,
    position[1]?.orderToken || null,
  );
};
export const fractionalCompare = <T extends { id: string; orderToken: string }>(
  item1: T,
  item2: T,
): number => {
  if (item1.orderToken === item2.orderToken) {
    return item1.id > item2.id ? 1 : -1;
  }

  return item1.orderToken > item2.orderToken ? 1 : -1;
};
export const timeCompare = <T extends { lastToggledAt: number; id: string }>(
  item1: T,
  item2: T,
): number => {
  if (item1.lastToggledAt === item2.lastToggledAt) {
    return item1.id > item2.id ? 1 : -1;
  }

  return item1.lastToggledAt < item2.lastToggledAt ? 1 : -1;
};

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

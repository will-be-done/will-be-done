import { getRootStore } from "mobx-keystone";
import { RootStore } from "./models";
import { OrderableItem } from "./listActions";
import { generateKeyBetween } from "fractional-indexing";

export const getRootStoreOrThrow = (node: object) => {
  const rootStore = getRootStore<RootStore>(node);
  if (!rootStore) throw new Error("Root store not found!");

  return rootStore;
};

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
  const orderToken = generateKeyBetween(
    between[0]?.orderToken,
    between[1]?.orderToken,
  );

  return orderToken;
};

export const generateOrderTokenPositioned = (
  current: {
    lastChild: OrderableItem | undefined;
    firstChild: OrderableItem | undefined;
  },
  position:
    | [OrderableItem | undefined, OrderableItem | undefined]
    | "append"
    | "prepend",
) => {
  if (position === "append") {
    return generateKeyBetween(current.lastChild?.orderToken, undefined);
  }

  if (position === "prepend") {
    return generateKeyBetween(undefined, current.firstChild?.orderToken);
  }

  return generateKeyBetween(position[0]?.orderToken, position[1]?.orderToken);
};

import { getRootStore } from "mobx-keystone";
import { RootStore } from "./models";
import { OrderableItem } from "./listActions";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";

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
  const orderToken = generateJitteredKeyBetween(
    between[0]?.orderToken || null,
    between[1]?.orderToken || null,
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
    return generateJitteredKeyBetween(
      current.lastChild?.orderToken || null,
      null,
    );
  }

  if (position === "prepend") {
    return generateJitteredKeyBetween(
      null,
      current.firstChild?.orderToken || null,
    );
  }

  return generateJitteredKeyBetween(
    position[0]?.orderToken || null,
    position[1]?.orderToken || null,
  );
};

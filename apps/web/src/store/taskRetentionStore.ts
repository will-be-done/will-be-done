import { useLayoutEffect, useMemo } from "react";
import { create } from "zustand";
import { type CardForDisplay } from "@will-be-done/slices/space";

type FocusKey = string & { __brand: never };

type RetainedCard = {
  focusKey: FocusKey;
  sourceListKey: string;
  displayData: CardForDisplay;
  group: number;
  index: number;
  orderToken: string;
};

type RetainedCardsState = {
  cardsByFocusKey: Record<string, RetainedCard>;
};

type RetainedCardsActions = {
  rememberCard: (card: RetainedCard) => void;
  clearCard: (focusKey: FocusKey) => void;
};

export const useRetainedCardsStore = create<
  RetainedCardsState & RetainedCardsActions
>((set, get) => ({
  cardsByFocusKey: {},

  rememberCard: (card) => {
    const existing = get().cardsByFocusKey[card.focusKey];
    if (existing && existing.sourceListKey !== card.sourceListKey) {
      return;
    }
    if (
      existing &&
      existing.displayData === card.displayData &&
      existing.group === card.group &&
      existing.index === card.index &&
      existing.orderToken === card.orderToken
    ) {
      return;
    }

    set((state) => ({
      cardsByFocusKey: {
        ...state.cardsByFocusKey,
        [card.focusKey]: card,
      },
    }));
  },

  clearCard: (focusKey) =>
    set((state) => {
      if (!state.cardsByFocusKey[focusKey]) return state;

      const { [focusKey]: _removed, ...cardsByFocusKey } =
        state.cardsByFocusKey;
      return { cardsByFocusKey };
    }),
}));

export const getCardDisplayFocusKey = (displayData: CardForDisplay) =>
  `${displayData.cardWrapper.type}^^${displayData.cardWrapper.id}` as FocusKey;

const getDisplayGroup = (displayData: CardForDisplay) => {
  const cardState = "state" in displayData.card ? displayData.card.state : null;
  return cardState === "done" ? 1 : 0;
};

const getDisplayOrderToken = (displayData: CardForDisplay) =>
  displayData.cardWrapper.orderToken;

const findRetainedInsertIndex = (
  displayItems: CardForDisplay[],
  retained: RetainedCard,
) => {
  const laterGroupIndex = displayItems.findIndex(
    (item) => getDisplayGroup(item) > retained.group,
  );
  const groupEnd =
    laterGroupIndex === -1 ? displayItems.length : laterGroupIndex;
  const groupStart = displayItems.findIndex(
    (item) => getDisplayGroup(item) === retained.group,
  );

  if (groupStart === -1) {
    return Math.min(retained.index, groupEnd);
  }

  for (let index = groupStart; index < groupEnd; index++) {
    if (getDisplayOrderToken(displayItems[index]) > retained.orderToken) {
      return index;
    }
  }

  return groupEnd;
};

export const useRetainedCardsForDisplayList = ({
  listKey,
  renderedItems,
  focusedKey,
}: {
  listKey: string;
  renderedItems: CardForDisplay[];
  focusedKey: FocusKey | null;
}) => {
  const retainedCards = useRetainedCardsStore((state) => state.cardsByFocusKey);

  const renderedFocusKeys = useMemo(
    () => new Set(renderedItems.map(getCardDisplayFocusKey)),
    [renderedItems],
  );

  useLayoutEffect(() => {
    if (!focusedKey) return;

    const focusedIndex = renderedItems.findIndex(
      (item) => getCardDisplayFocusKey(item) === focusedKey,
    );
    if (focusedIndex === -1) return;

    const focusedDisplayData = renderedItems[focusedIndex];
    if (!focusedDisplayData) return;

    useRetainedCardsStore.getState().rememberCard({
      focusKey: focusedKey,
      sourceListKey: listKey,
      displayData: focusedDisplayData,
      group: getDisplayGroup(focusedDisplayData),
      index: focusedIndex,
      orderToken: getDisplayOrderToken(focusedDisplayData),
    });
  }, [focusedKey, listKey, renderedItems]);

  return useMemo(() => {
    const displayItems = renderedItems.filter((item) => {
      const focusKey = getCardDisplayFocusKey(item);
      const retained = retainedCards[focusKey];
      return !retained || retained.sourceListKey === listKey;
    });

    const retainedItems = Object.values(retainedCards)
      .filter((item) => item.sourceListKey === listKey)
      .filter((item) => !renderedFocusKeys.has(item.focusKey))
      .sort((a, b) => {
        if (a.group !== b.group) return a.group - b.group;
        if (a.orderToken !== b.orderToken) {
          return a.orderToken > b.orderToken ? 1 : -1;
        }
        return a.index - b.index;
      });

    for (const item of retainedItems) {
      displayItems.splice(
        findRetainedInsertIndex(displayItems, item),
        0,
        item.displayData,
      );
    }

    return {
      displayItems,
      retainedItems,
    };
  }, [listKey, renderedFocusKeys, renderedItems, retainedCards]);
};

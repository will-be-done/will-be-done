import {
  getParent,
  getRefsResolvingTo,
  Ref,
  RefConstructor,
} from "mobx-keystone";
import { fractionalCompare } from "../utils/fractionalSort";
// @computed
// siblings(): [TodoProjection] {
//   const dailyList = this.dailyListRef.current;
//
//   const i = dailyList.sortedProjections.findIndex((it) => it === this);
//
//   return [
//     dailyList.sortedProjections[i - 1],
//     dailyList.sortedProjections[i + 1],
//   ];
// }

type Class<T = any> = new (...args: any[]) => T;

export function getChildren<K extends BaseListItem, L extends ItemsList<K>>(
  list: L,
  refConstructor: RefConstructor<L>,
  klass: Class<K>,
): K[] {
  const children: K[] = [];
  for (const ref of getRefsResolvingTo(list, refConstructor, {
    updateAllRefsIfNeeded: true,
  })) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const parent = getParent(ref);
    if (parent instanceof klass) {
      children.push(parent);
    }
  }

  return children.sort(fractionalCompare);
}

export function getSiblings<K extends BaseListItem>(
  listItem: K,
): [K | undefined, K | undefined] {
  const children = listItem.listRef.current.children;

  const i = children.findIndex((it) => it.id === listItem.id);

  return [children[i - 1] as K, children[i + 1] as K];
}

// export function addProjectionFromOtherList(
//   sourceProjection: Projection,
//   targetProjection: Projection,
//   edge: "top" | "bottom",
// ) {
//   // if (!(targetProjection instanceof TaskProjection)) {
//   //   throw new Error("Target projection is not task");
//   // }
//   //
//   // if (targetProjection.listRef.current !== this) {
//   //   throw new Error("Target projection is not in this daily list");
//   // }
//
//   let [up, down] = targetProjection.siblings;
//
//   if (edge == "top") {
//     down = targetProjection;
//   } else {
//     up = targetProjection;
//   }
//
//   const newOrderToken = generateKeyBetween(up?.orderToken, down?.orderToken);
//   sourceProjection.orderToken = newOrderToken;
//   sourceProjection.listRef = clone(targetProjection.listRef);
// }

export interface ItemsList<K> {
  id: string;
  children: BaseListItem<K>[];
  lastChild: BaseListItem<K> | undefined;
  firstChild: BaseListItem<K> | undefined;

  makeListRef(): Ref<ItemsList<K>>;
}

export interface OrderableItem {
  orderToken: string;
}

export interface BaseListItem<S = unknown> {
  id: string;
  siblings: [BaseListItem<S> | undefined, BaseListItem<S> | undefined];
  listRef: Ref<ItemsList<S>>;
  orderToken: string;
}

export interface ListItemsRegistry<K> {
  getById(id: string): BaseListItem<K> | undefined;
}

export interface ItemsListsRegistry<K> {
  getById(id: string): ItemsList<K> | undefined;
}

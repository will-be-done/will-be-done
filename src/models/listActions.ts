import {
  clone,
  getParent,
  getRefsResolvingTo,
  Ref,
  RefConstructor,
} from "mobx-keystone";
import { List, Projection } from "./models";
import { fractionalCompare } from "../utils/fractionalSort";
import { generateKeyBetween } from "fractional-indexing";
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

export function getProjections<L extends List, K extends Projection>(
  list: L,
  refConstructor: RefConstructor<L>,
  klass: Class<K>,
): K[] {
  const projections: K[] = [];
  for (const ref of getRefsResolvingTo(list, refConstructor, {
    updateAllRefsIfNeeded: true,
  })) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const parent = getParent(ref);
    if (parent instanceof klass) {
      projections.push(parent);
    }
  }

  return projections.sort(fractionalCompare);
}

export function getSiblings<T extends Projection>(
  projection: T,
): [T | undefined, T | undefined] {
  const projections = projection.listRef.current.projections as T[];

  const i = projections.findIndex((it) => it.id === projection.id);

  return [projections[i - 1], projections[i + 1]];
}

export function addProjectionFromOtherList(
  sourceProjection: Projection,
  targetProjection: Projection,
  edge: "top" | "bottom",
) {
  // if (!(targetProjection instanceof TaskProjection)) {
  //   throw new Error("Target projection is not task");
  // }
  //
  // if (targetProjection.listRef.current !== this) {
  //   throw new Error("Target projection is not in this daily list");
  // }

  let [up, down] = targetProjection.siblings;

  if (edge == "top") {
    down = targetProjection;
  } else {
    up = targetProjection;
  }

  const newOrderToken = generateKeyBetween(up?.orderToken, down?.orderToken);
  sourceProjection.orderToken = newOrderToken;
  sourceProjection.listRef = clone(targetProjection.listRef);
}

// export interface ProjectionsList<K> {
//   projections: BaseProjection<K>[];
//   lastProjection: BaseProjection<K> | undefined;
//
//   addProjectionFromOtherList<B>(
//     sourceProjection: BaseProjection<B>,
//     targetProjection: BaseProjection<K>,
//     edge: "top" | "bottom",
//   ): void;
//
//   append(projection: BaseProjection<K>): void;
//
//   appendProjectionFromOtherList<B>(sourceProjection: BaseProjection<B>): void;
// }
//
// export interface BaseProjection<S = unknown> {
//   siblings: [BaseProjection<S> | undefined, BaseProjection<S> | undefined];
//   listRef: Ref<ProjectionsList<BaseProjection<S>>>;
//   orderToken: string;
// }

import { getParent, getRefsResolvingTo, RefConstructor } from "mobx-keystone";
import { List, Projection } from "./models";
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

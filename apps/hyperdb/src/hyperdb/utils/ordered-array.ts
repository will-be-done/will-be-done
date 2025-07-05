/* eslint-disable @typescript-eslint/no-explicit-any */
// NOTE: taken from https://github.com/ccorcos/ordered-array/blob/master/src/ordered-array.ts
export type SearchResult =
  | { found: number; closest?: undefined }
  | { found?: undefined; closest: number };

const identity = (x: any) => x;
const compare = (a: any, b: any) => (a === b ? 0 : a > b ? 1 : -1);

export function orderedArray<TValue, TKey = TValue>(
  getKey: (item: TValue) => TKey,
  compareKey: (a: TKey, b: TKey) => number = compare,
) {
  return {
    search: <I extends TValue>(list: Array<I>, key: TKey) =>
      search(list, key, getKey, compareKey),
    searchFirst: <I extends TValue>(list: Array<I>, key: TKey) =>
      searchFirst(list, key, getKey, compareKey),
    searchLast: <I extends TValue>(list: Array<I>, key: TKey) =>
      searchLast(list, key, getKey, compareKey),
    insert: <I extends TValue>(list: Array<I>, item: I) =>
      insert(list, item, getKey, compareKey),
    insertBefore: <I extends TValue>(list: Array<I>, item: I) =>
      insertBefore(list, item, getKey, compareKey),
    insertAfter: <I extends TValue>(list: Array<I>, item: I) =>
      insertAfter(list, item, getKey, compareKey),
    // prettier-ignore
    update: <I extends TValue>(list: Array<I>, key: TKey, fn: (existing: I | undefined) => I | undefined | void) =>
			update(list, key, fn, getKey, compareKey),
    remove: <I extends TValue>(list: Array<I>, key: TKey) =>
      remove(list, key, getKey, compareKey),
  };
}

export function search<T, K = T>(
  list: Array<T>,
  key: K,
  getKey: (item: T) => K = identity,
  compareKey: (a: K, b: K) => number = compare,
): SearchResult {
  let min = 0;
  let max = list.length - 1;
  while (min <= max) {
    const k = (max + min) >> 1;
    const dir = compareKey(getKey(list[k]), key) * -1;
    if (dir > 0) {
      min = k + 1;
    } else if (dir < 0) {
      max = k - 1;
    } else {
      return { found: k };
    }
  }
  return { closest: min };
}

/** Same as search, but finds the first item matching the key, if keys aren't unique. */
export function searchLast<T, K = T>(
  list: Array<T>,
  key: K,
  getKey: (item: T) => K = identity,
  compareKey: (a: K, b: K) => number = compare,
): SearchResult {
  const result = search(list, key, getKey, compareKey);
  if (result.found === undefined) return result;

  let found = result.found;
  while (true) {
    const next = found + 1;
    if (next >= list.length) break;
    if (compareKey(getKey(list[next]), key) !== 0) break;
    found = next;
  }

  return { found };
}

/** Same as search, but finds the last item matching the key, if keys aren't unique. */
export function searchFirst<T, K = T>(
  list: Array<T>,
  key: K,
  getKey: (item: T) => K = identity,
  compareKey: (a: K, b: K) => number = compare,
): SearchResult {
  const result = search(list, key, getKey, compareKey);
  if (result.found === undefined) return result;

  let found = result.found;
  while (true) {
    const prev = found - 1;
    if (prev < 0) break;
    if (compareKey(getKey(list[prev]), key) !== 0) break;
    found = prev;
  }

  return { found };
}

/** Replaces item with the same key. */
export function insert<T, K = T>(
  list: Array<T>,
  item: T,
  getKey: (item: T) => K = identity,
  compareKey: (a: K, b: K) => number = compare,
): T | undefined {
  const result = search(list, getKey(item), getKey, compareKey);
  if (result.found !== undefined) {
    // Replace the whole item.
    const [oldItem] = list.splice(result.found, 1, item);
    return oldItem;
  } else {
    // Insert at missing index.
    list.splice(result.closest, 0, item);
  }
}

/** Does not replace an existing item with the same key. */
export function insertBefore<T, K = T>(
  list: Array<T>,
  item: T,
  getKey: (item: T) => K = identity,
  compareKey: (a: K, b: K) => number = compare,
) {
  const result = searchFirst(list, getKey(item), getKey, compareKey);
  if (result.found !== undefined) {
    list.splice(result.found, 0, item);
  } else {
    // Insert at missing index.
    list.splice(result.closest, 0, item);
  }
}

/** Does not replace an existing item with the same key. */
export function insertAfter<T, K = T>(
  list: Array<T>,
  item: T,
  getKey: (item: T) => K = identity,
  compareKey: (a: K, b: K) => number = compare,
) {
  const result = searchLast(list, getKey(item), getKey, compareKey);
  if (result.found !== undefined) {
    list.splice(result.found + 1, 0, item);
  } else {
    // Insert at missing index.
    list.splice(result.closest, 0, item);
  }
}

export function update<T, K = T>(
  list: Array<T>,
  key: K,
  fn: (existing: T | undefined) => T | undefined | void,
  getKey: (item: T) => K = identity,
  compareKey: (a: K, b: K) => number = compare,
): T | undefined {
  const result = search(list, key, getKey, compareKey);
  if (result.found !== undefined) {
    const newItem = fn(list[result.found]);
    if (newItem === undefined) {
      // Delete the item.
      const [oldItem] = list.splice(result.found, 1);
      return oldItem;
    } else {
      if (compareKey(getKey(newItem), key) !== 0)
        throw new Error("Key should never change during update()");
      const [oldItem] = list.splice(result.found, 1, newItem);
      return oldItem;
    }
  } else {
    // Insert at missing index.
    const newItem = fn(undefined);
    if (newItem !== undefined) {
      if (compareKey(getKey(newItem), key) !== 0)
        throw new Error("New item does not have the correct key.");
      list.splice(result.closest, 0, newItem);
    }
  }
}

export function remove<T, K = T>(
  list: T[],
  key: K,
  getKey: (item: T) => K = identity,
  compareKey: (a: K, b: K) => number = compare,
): T | undefined {
  const { found } = search(list, key, getKey, compareKey);
  if (found !== undefined) {
    // Remove from index.
    const [oldItem] = list.splice(found, 1);
    return oldItem;
  }
}

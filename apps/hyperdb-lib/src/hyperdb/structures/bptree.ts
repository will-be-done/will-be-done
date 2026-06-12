/* eslint-disable @typescript-eslint/no-explicit-any */
// NOTE: taken from https://github.com/ccorcos/database-experiments/blob/master/src/lib/InMemoryBinaryPlusTree.ts
import { orderedArray } from "./ordered-array";

export type BranchNode<K> = {
  leaf: false;
  id: string;
  children: { minKey: K | null; childId: string }[];
};

export type LeafNode<K, V> = {
  leaf: true;
  id: string;
  values: { key: K; value: V }[];
};

function compare(a: any, b: any) {
  if (a === b) return 0;
  if (a > b) return 1;
  return -1;
}

type NodeCursor<K, V> = {
  nodePath: (BranchNode<K> | LeafNode<K, V>)[];
  indexPath: number[];
};

type IterateArgs<K> = {
  gt?: K;
  gte?: K;
  lt?: K;
  lte?: K;
  limit?: number;
  reverse?: boolean;
};

function newLeafNode<K, V>(
  values: { key: K; value: V }[],
  id = randomId(),
): LeafNode<K, V> {
  if (values.length === 0) throw new Error("Empty leaf node");

  // console.log("newLeafNode", id, values);

  return {
    leaf: true,
    id,
    values,
  };
}

export class InMemoryBinaryPlusTree<K = any, V = any> {
  nodes = new Map<string, BranchNode<K> | LeafNode<K, V>>();
  rootId = "root";
  private base?: InMemoryBinaryPlusTree<K, V>;
  private owner = {};
  minSize: number;
  maxSize: number;
  compareKey: (a: K, b: K) => number;
  leafValues: ReturnType<typeof orderedArray<{ key: K; value: V }, K>>;

  /**
   * minSize must be less than maxSize / 2.
   */
  constructor(
    minSize: number,
    maxSize: number,
    compareKey: (a: K, b: K) => number = compare,
  ) {
    this.minSize = minSize;
    this.maxSize = maxSize;
    this.compareKey = compareKey;
    this.leafValues = orderedArray<{ key: K; value: V }, K>(
      (item: { key: K }) => item.key,
      this.compareKey,
    );

    if (minSize > maxSize / 2) throw new Error("Invalid tree size.");
  }

  fork(): InMemoryBinaryPlusTree<K, V> {
    const forked = new InMemoryBinaryPlusTree<K, V>(
      this.minSize,
      this.maxSize,
      this.compareKey,
    );

    forked.base = this;
    forked.rootId = this.rootId;

    return forked;
  }

  materializeFork(): InMemoryBinaryPlusTree<K, V> {
    if (!this.base) return this;

    this.base.rootId = this.rootId;
    this.base.owner = {};

    for (const [id, node] of this.nodes) {
      this.ownNode(node, this.base.owner);
      this.base.nodes.set(id, node);
    }

    return this.base;
  }

  private getNode(id: string): BranchNode<K> | LeafNode<K, V> | undefined {
    return this.nodes.get(id) ?? this.base?.getNode(id);
  }

  private ownNode<T extends BranchNode<K> | LeafNode<K, V>>(
    node: T,
    owner = this.owner,
  ): T {
    (node as T & { owner?: object }).owner = owner;
    return node;
  }

  private ownsNode(node: BranchNode<K> | LeafNode<K, V>): boolean {
    return (node as typeof node & { owner?: object }).owner === this.owner;
  }

  private cloneNode(
    node: BranchNode<K> | LeafNode<K, V>,
    id = randomId(),
  ): BranchNode<K> | LeafNode<K, V> {
    if (node.leaf === true) {
      return this.ownNode({
        id,
        leaf: true,
        values: node.values.map((entry) => ({
          key: entry.key,
          value: entry.value,
        })),
      });
    }

    return this.ownNode({
      id,
      leaf: false,
      children: node.children.map((child) => ({
        minKey: child.minKey,
        childId: child.childId,
      })),
    });
  }

  private writableRoot(): BranchNode<K> | LeafNode<K, V> | undefined {
    const root = this.getNode(this.rootId);
    if (!root) return;
    if (this.ownsNode(root)) return root;

    const cloned = this.cloneNode(root, this.rootId);
    this.nodes.set(cloned.id, cloned);
    this.rootId = cloned.id;
    return cloned;
  }

  private writableChild(parent: BranchNode<K>, childIndex: number) {
    const childId = parent.children[childIndex].childId;
    const child = this.getNode(childId);
    if (!child) throw Error("Missing child node.");
    if (this.ownsNode(child)) return child;

    const cloned = this.cloneNode(child);
    this.nodes.set(cloned.id, cloned);
    parent.children[childIndex] = {
      ...parent.children[childIndex],
      childId: cloned.id,
    };
    return cloned;
  }

  private deleteNodeIfOwned(node: BranchNode<K> | LeafNode<K, V>) {
    if (this.ownsNode(node)) {
      this.nodes.delete(node.id);
    }
  }

  private compareBranchKey = (a: K | null, b: K | null) => {
    if (a === null || b === null) {
      if (a === null) return -1;
      if (b === null) return 1;
    }
    return this.compareKey(a, b);
  };

  private searchBranchChild(
    children: { minKey: K | null; childId: string }[],
    key: K,
  ) {
    let left = 0;
    let right = children.length;

    while (left < right) {
      const mid = (left + right) >>> 1;
      const minKey = children[mid].minKey;
      const cmp = minKey === null ? -1 : this.compareKey(minKey, key);

      if (cmp === 0) return mid;
      if (cmp < 0) left = mid + 1;
      else right = mid;
    }

    if (left === 0) throw new Error("Broken.");
    return left - 1;
  }

  private findPathFromRoot(key: K, writable = false): NodeCursor<K, V> {
    const nodePath: (BranchNode<K> | LeafNode<K, V>)[] = [];
    const indexPath: number[] = [];

    const root = writable ? this.writableRoot() : this.getNode(this.rootId);
    if (!root) return { nodePath, indexPath };
    nodePath.push(root);

    while (true) {
      const node = nodePath[nodePath.length - 1];
      if (node.leaf === true) return { nodePath, indexPath };

      const childIndex = this.searchBranchChild(node.children, key);
      const child = writable
        ? this.writableChild(node, childIndex)
        : this.getNode(node.children[childIndex].childId);
      if (!child) throw Error("Missing child node.");
      nodePath.push(child);
      indexPath.push(childIndex);
    }
  }

  private findPath(key: K, writable = false): NodeCursor<K, V> {
    const nodePath: (BranchNode<K> | LeafNode<K, V>)[] = [];
    const indexPath: number[] = [];

    const root = writable ? this.writableRoot() : this.getNode(this.rootId);
    if (!root) return { nodePath, indexPath };
    nodePath.push(root);

    while (true) {
      const node = nodePath[0];
      if (node.leaf === true) return { nodePath, indexPath };

      const childIndex = this.searchBranchChild(node.children, key);
      const child = writable
        ? this.writableChild(node, childIndex)
        : this.getNode(node.children[childIndex].childId);
      if (!child) throw Error("Missing child node.");
      nodePath.unshift(child);
      indexPath.unshift(childIndex);
    }
  }

  get(key: K): V | undefined {
    let node = this.getNode(this.rootId);
    if (!node) return;

    while (node.leaf !== true) {
      const childIndex = this.searchBranchChild(node.children, key);
      const childId = node.children[childIndex].childId;
      const child = this.getNode(childId);
      if (!child) throw Error("Missing child node.");
      node = child;
    }

    const index = this.searchLeafValueIndex(node.values, key);
    if (index < 0) return;
    return node.values[index].value;
  }

  private startCursor() {
    const cursor: NodeCursor<K, V> = {
      nodePath: [],
      indexPath: [],
    };
    const root = this.getNode(this.rootId);
    if (!root) return cursor;
    cursor.nodePath.push(root);

    while (true) {
      const node = cursor.nodePath[0];
      if (node.leaf === true) break;
      const childIndex = 0;
      const childId = node.children[childIndex].childId;
      const child = this.getNode(childId);
      if (!child) throw new Error("Broken.");
      cursor.nodePath.unshift(child);
      cursor.indexPath.unshift(childIndex);
    }
    return cursor;
  }

  private nextCursor(cursor: NodeCursor<K, V>): NodeCursor<K, V> | undefined {
    // console.log(cursor)
    cursor = {
      nodePath: [...cursor.nodePath],
      indexPath: [...cursor.indexPath],
    };
    for (let i = 0; i < cursor.nodePath.length - 1; i++) {
      // Find the point in the path where we need to go down a sibling branch.
      const parent = cursor.nodePath[i + 1] as BranchNode<K>;
      const parentIndex = cursor.indexPath[i];
      const nextIndex = parentIndex + 1;
      if (nextIndex >= parent.children.length) continue;

      // Here's a branch.
      cursor.indexPath[i] = nextIndex;

      // Fix the rest of the cursor.
      for (let j = i; j >= 0; j--) {
        const parent = cursor.nodePath[j + 1] as BranchNode<K>;
        const parentIndex = cursor.indexPath[j];
        const childId = parent.children[parentIndex].childId;
        const child = this.getNode(childId);
        if (!child) throw new Error("Broken.");
        cursor.nodePath[j] = child;
        if (j > 0) cursor.indexPath[j - 1] = 0;
      }
      return cursor;
    }
  }

  private endCursor() {
    const cursor: NodeCursor<K, V> = {
      nodePath: [],
      indexPath: [],
    };
    const root = this.getNode(this.rootId);
    if (!root) return cursor;
    cursor.nodePath.push(root);
    while (true) {
      const node = cursor.nodePath[0];
      if (node.leaf === true) break;
      const childIndex = node.children.length - 1;
      const childId = node.children[childIndex].childId;
      const child = this.getNode(childId);
      if (!child) throw new Error("Broken.");
      cursor.nodePath.unshift(child);
      cursor.indexPath.unshift(childIndex);
    }
    return cursor;
  }

  private prevCursor(cursor: NodeCursor<K, V>): NodeCursor<K, V> | undefined {
    cursor = {
      nodePath: [...cursor.nodePath],
      indexPath: [...cursor.indexPath],
    };
    for (let i = 0; i < cursor.nodePath.length - 1; i++) {
      // Find the point in the path where we need to go down a sibling branch.
      const parentIndex = cursor.indexPath[i];
      const prevIndex = parentIndex - 1;
      if (prevIndex < 0) continue;

      // Here's a branch.
      cursor.indexPath[i] = prevIndex;

      // Fix the rest of the cursor.
      for (let j = i; j >= 0; j--) {
        const parent = cursor.nodePath[j + 1] as BranchNode<K>;
        const parentIndex = cursor.indexPath[j];
        const childId = parent.children[parentIndex].childId;
        const child = this.getNode(childId);
        if (!child) throw new Error("Broken.");
        cursor.nodePath[j] = child;
        if (j > 0)
          cursor.indexPath[j - 1] = child.leaf === true ? child.values.length - 1
            : child.children.length - 1;
      }
      return cursor;
    }
  }

  private validateIterateArgs(args: IterateArgs<K>) {
    if (args.gt !== undefined && args.gte !== undefined)
      throw new Error("Invalid bounds: {gt, gte}");
    if (args.lt !== undefined && args.lte !== undefined)
      throw new Error("Invalid bounds: {lt, lte}");

    const start =
      args.gt !== undefined
        ? args.gt
        : args.gte !== undefined
          ? args.gte
          : undefined;
    const startOpen = args.gt !== undefined;
    const end =
      args.lt !== undefined
        ? args.lt
        : args.lte !== undefined
          ? args.lte
          : undefined;
    const endOpen = args.lt !== undefined;

    if (start !== undefined && end !== undefined) {
      const comp = this.compareKey(start, end);
      if (comp > 0) {
        console.warn("Invalid bounds.", args);
        throw new Error("Invalid bounds.");
      }
      if (comp === 0 && (startOpen || endOpen)) {
        console.warn("Invalid bounds.", args);
        throw new Error("Invalid bounds.");
      }
    }

    return { start, startOpen, end, endOpen };
  }

  *iterate(args: IterateArgs<K> = {}): IterableIterator<{ key: K; value: V }> {
    if (args.limit !== undefined && args.limit <= 0) return;

    const { start, startOpen, end, endOpen } =
      this.validateIterateArgs(args);
    let yielded = 0;

    if (args.reverse) {
      let cursor: NodeCursor<K, V> | undefined;
      if (end !== undefined) {
        cursor = this.findPath(end);
      } else {
        cursor = this.endCursor();
      }

      if (cursor.nodePath.length === 0) return;

      let isFirstLeaf = true;
      while (cursor) {
        const leaf = cursor.nodePath[0] as LeafNode<K, V>;
        let index = leaf.values.length - 1;

        if (isFirstLeaf && end !== undefined) {
          const result = this.searchLeafValues(leaf.values, end);
          index =
            result.found !== undefined
              ? endOpen
                ? result.found - 1
                : result.found
              : result.closest - 1;
        }

        for (let i = index; i >= 0; i--) {
          const item = leaf.values[i];

          if (start !== undefined) {
            const comp = this.compareKey(item.key, start);
            if (comp < 0 || (comp === 0 && startOpen)) return;
          }

          yield item;
          yielded++;

          if (args.limit !== undefined && yielded >= args.limit) return;
        }

        cursor = this.prevCursor(cursor);
        isFirstLeaf = false;
      }

      return;
    }

    let cursor: NodeCursor<K, V> | undefined;
    if (start !== undefined) {
      cursor = this.findPath(start);
    } else {
      cursor = this.startCursor();
    }

    if (cursor.nodePath.length === 0) return;

    let isFirstLeaf = true;
    while (cursor) {
      const leaf = cursor.nodePath[0] as LeafNode<K, V>;
      let index = 0;

      if (isFirstLeaf && start !== undefined) {
        const result = this.searchLeafValues(leaf.values, start);
        index =
          result.found !== undefined
            ? startOpen
              ? result.found + 1
              : result.found
            : result.closest;
      }

      for (let i = index; i < leaf.values.length; i++) {
        const item = leaf.values[i];

        if (end !== undefined) {
          const comp = this.compareKey(item.key, end);
          if (comp > 0 || (comp === 0 && endOpen)) return;
        }

        yield item;
        yielded++;

        if (args.limit !== undefined && yielded >= args.limit) return;
      }

      cursor = this.nextCursor(cursor);
      isFirstLeaf = false;
    }
  }

  list(args: IterateArgs<K> = {}) {
    return Array.from(this.iterate(args));
  }

  set(key: K, value: V) {
    const { nodePath, indexPath } = this.findPathFromRoot(key, true);

    // Intitalize root node.
    if (nodePath.length === 0) {
      const root = this.ownNode(newLeafNode([{ key, value }], this.rootId));
      this.nodes.set(root.id, root);
      return;
    }

    // Insert into leaf node.
    const leaf = nodePath[nodePath.length - 1] as LeafNode<K, V>;
    const existing = this.insertLeafValue(leaf.values, { key, value });
    // No need to rebalance if we're replacing an existing item.
    if (existing) return;

    // Balance the tree by splitting nodes, starting from the leaf.
    let node = nodePath.pop();
    while (node) {
      const size = node.leaf === true ? node.values.length : node.children.length;
      if (size <= this.maxSize) break;
      const splitIndex = Math.round(size / 2);

      if (node.leaf === true) {
        // NOTE: this mutates the array!
        const rightValues = node.values.splice(splitIndex);
        const rightNode = this.ownNode(newLeafNode(rightValues));
        this.nodes.set(rightNode.id, rightNode);
        const rightMinKey = rightNode.values[0].key;

        if (node.id === this.rootId) {
          const leftNode = this.ownNode(newLeafNode(node.values));
          this.nodes.set(leftNode.id, leftNode);
          const rootNode = this.ownNode<BranchNode<K>>({
            id: node.id,
            leaf: false,
            children: [
              { minKey: null, childId: leftNode.id },
              { minKey: rightMinKey, childId: rightNode.id },
            ],
          });
          this.nodes.set(rootNode.id, rootNode);
          break;
        }

        // Insert right node into parent.
        const parent = nodePath.pop() as BranchNode<K>;
        const parentIndex = indexPath.pop();
        if (!parent) throw new Error("Broken.");
        if (parentIndex === undefined) throw new Error("Broken.");
        parent.children.splice(parentIndex + 1, 0, {
          minKey: rightMinKey,
          childId: rightNode.id,
        });

        // Recur
        node = parent;
        continue;
      }

      // NOTE: this mutates the array!
      const rightChildren = node.children.splice(splitIndex);
      const rightNode = this.ownNode<BranchNode<K>>({
        id: randomId(),
        leaf: false,
        children: rightChildren,
      });
      this.nodes.set(rightNode.id, rightNode);
      const rightMinKey = rightNode.children[0].minKey;

      if (node.id === this.rootId) {
        const leftNode = this.ownNode<BranchNode<K>>({
          id: randomId(),
          leaf: false,
          // NOTE: this array was mutated above.
          children: node.children,
        });
        this.nodes.set(leftNode.id, leftNode);
        const rootNode = this.ownNode<BranchNode<K>>({
          id: node.id,
          leaf: false,
          children: [
            { minKey: null, childId: leftNode.id },
            { minKey: rightMinKey, childId: rightNode.id },
          ],
        });
        this.nodes.set(rootNode.id, rootNode);
        break;
      }

      // Insert right node into parent.
      const parent = nodePath.pop() as BranchNode<K>;
      const parentIndex = indexPath.pop();
      if (!parent) throw new Error("Broken.");
      if (parentIndex === undefined) throw new Error("Broken.");
      parent.children.splice(parentIndex + 1, 0, {
        minKey: rightMinKey,
        childId: rightNode.id,
      });

      // Recur
      node = parent;
    }
  }

  delete(key: K) {
    const { nodePath, indexPath } = this.findPath(key, true);
    if (nodePath.length === 0) return;

    const leaf = nodePath[0] as LeafNode<K, V>;
    const exists = this.leafValues.remove(leaf.values, key);
    // console.log("delete", node, exists);
    if (!exists) return; // No changes to the tree!

    // Merge or redistribute to maintain minSize.
    let node = nodePath.shift();
    while (node) {
      if (node.id === this.rootId) {
        // A root leaf node has no minSize constaint.
        if (node.leaf === true) return;

        // Cleanup an empty root node.
        if (node.children.length === 0) {
          this.nodes.delete(this.rootId);
          return;
        }

        // A root node with one child becomes its child.
        if (node.children.length === 1) {
          const childId = node.children[0].childId;
          const childNode = this.getNode(childId);
          if (!childNode) throw new Error("Broken.");
          const root = this.cloneNode(childNode, this.rootId);
          this.nodes.set(root.id, root);
          this.rootId = root.id;
          this.deleteNodeIfOwned(childNode);
        }

        return;
      }

      const parent = nodePath.shift() as BranchNode<K>;
      const parentIndex = indexPath.shift();
      if (!parent) throw new Error("Broken.");
      if (parentIndex === undefined) throw new Error("Broken.");

      const size = node.leaf === true ? node.values.length : node.children.length;
      // console.log("minkey", node, node.leaf);
      // TODO: doesn't handle when leaf has values.length === 0
      const minKey = node.leaf === true ? node.values[0].key : node.children[0].minKey;

      // No need to merge but we might need to update the minKey in the parent
      if (size >= this.minSize) {
        const parentItem = parent.children[parentIndex];
        // No need to recusively update the left-most branch.
        if (parentItem.minKey === null) return;
        // No need to recursively update if the minKey didn't change.
        if (this.compareBranchKey(parentItem.minKey, minKey) === 0) return;
        // Set the minKey and recur
        parentItem.minKey = minKey;
        node = parent;
        continue;
      }

      // Merge or redistribute leaf nodes.
      if (node.leaf === true) {
        if (parentIndex === 0) {
          const rightId = parent.children[parentIndex + 1].childId;
          const rightSibling = this.getNode(rightId) as LeafNode<K, V>;
          if (!rightSibling) throw new Error("Broken.");

          const combinedSize = node.values.length + rightSibling.values.length;

          // Redistribute leaf.
          if (combinedSize > this.maxSize) {
            const writableRightSibling = this.writableChild(
              parent,
              parentIndex + 1,
            ) as LeafNode<K, V>;
            const splitIndex =
              Math.round(combinedSize / 2) - node.values.length;
            // NOTE: this mutates the array!
            const moveLeft = writableRightSibling.values.splice(0, splitIndex);
            node.values.push(...moveLeft);
            // Update parent minKey.
            if (parent.children[parentIndex].minKey !== null) {
              const leftMinKey = node.values[0].key;
              parent.children[parentIndex].minKey = leftMinKey;
            }
            const rightMinKey = writableRightSibling.values[0].key;
            parent.children[parentIndex + 1].minKey = rightMinKey;

            // Recur
            node = parent;
            continue;
          }

          // Merge leaves.
          node.values.push(...rightSibling.values);
          // Delete rightSibling
          parent.children.splice(1, 1);
          this.deleteNodeIfOwned(rightSibling);
          // Update parent minKey
          const leftMost = parent.children[0].minKey === null;
          const minKey = leftMost ? null : node.values[0].key;
          parent.children[0].minKey = minKey;

          // Recur
          node = parent;
          continue;
        }

        const leftId = parent.children[parentIndex - 1].childId;
        const leftSibling = this.getNode(leftId) as LeafNode<K, V>;
        if (!leftSibling) throw new Error("Broken.");

        const combinedSize = leftSibling.values.length + node.values.length;

        // Redistribute leaf.
        if (combinedSize > this.maxSize) {
          const writableLeftSibling = this.writableChild(
            parent,
            parentIndex - 1,
          ) as LeafNode<K, V>;
          const splitIndex = Math.round(combinedSize / 2);

          const moveRight = writableLeftSibling.values.splice(
            splitIndex,
            this.maxSize,
          );
          node.values.unshift(...moveRight);

          // Update parent minKey.
          parent.children[parentIndex].minKey = node.values[0].key;

          // Recur
          node = parent;
          continue;
        }

        // Merge leaf.
        const writableLeftSibling = this.writableChild(
          parent,
          parentIndex - 1,
        ) as LeafNode<K, V>;
        writableLeftSibling.values.push(...node.values);
        // Delete the node
        parent.children.splice(parentIndex, 1);
        this.deleteNodeIfOwned(node);
        // No need to update minKey because we added to the right.

        // Recur
        node = parent;
        continue;
      }

      // Merge or redistribute branch nodes.
      if (parentIndex === 0) {
        const rightId = parent.children[parentIndex + 1].childId;
        const rightSibling = this.getNode(rightId) as BranchNode<K>;
        if (!rightSibling) throw new Error("Broken.");

        const combinedSize =
          node.children.length + rightSibling.children.length;

        // Redistribute leaf.
        if (combinedSize > this.maxSize) {
          const writableRightSibling = this.writableChild(
            parent,
            parentIndex + 1,
          ) as BranchNode<K>;
          const splitIndex =
            Math.round(combinedSize / 2) - node.children.length;
          // NOTE: this mutates the array!
          const moveLeft = writableRightSibling.children.splice(0, splitIndex);
          node.children.push(...moveLeft);
          // Update parent minKey.
          if (parent.children[parentIndex].minKey !== null) {
            const leftMinKey = node.children[0].minKey;
            parent.children[parentIndex].minKey = leftMinKey;
          }
          const rightMinKey = writableRightSibling.children[0].minKey;
          parent.children[parentIndex + 1].minKey = rightMinKey;

          // Recur
          node = parent;
          continue;
        }

        // Merge leaves.
        node.children.push(...rightSibling.children);
        // Delete rightSibling
        parent.children.splice(1, 1);
        this.deleteNodeIfOwned(rightSibling);
        // Update parent minKey
        const leftMost = parent.children[0].minKey === null;
        const minKey = leftMost ? null : node.children[0].minKey;
        parent.children[0].minKey = minKey;

        // Recur
        node = parent;
        continue;
      }

      const leftId = parent.children[parentIndex - 1].childId;
      const leftSibling = this.getNode(leftId) as BranchNode<K>;
      if (!leftSibling) throw new Error("Broken.");

      const combinedSize = leftSibling.children.length + node.children.length;

      // Redistribute leaf.
      if (combinedSize > this.maxSize) {
        const writableLeftSibling = this.writableChild(
          parent,
          parentIndex - 1,
        ) as BranchNode<K>;
        const splitIndex = Math.round(combinedSize / 2);

        const moveRight = writableLeftSibling.children.splice(
          splitIndex,
          this.maxSize,
        );
        node.children.unshift(...moveRight);

        // Update parent minKey.
        parent.children[parentIndex].minKey = node.children[0].minKey;

        // Recur
        node = parent;
        continue;
      }

      // Merge leaf.
      const writableLeftSibling = this.writableChild(
        parent,
        parentIndex - 1,
      ) as BranchNode<K>;
      writableLeftSibling.children.push(...node.children);
      // Delete the node
      parent.children.splice(parentIndex, 1);
      this.deleteNodeIfOwned(node);
      // No need to update minKey because we added to the right.

      // Recur
      node = parent;
      continue;
    }
  }

  private searchLeafValues(values: { key: K; value: V }[], searchKey: K) {
    const index = this.searchLeafValueIndex(values, searchKey);
    if (index >= 0) return { found: index, closest: index };
    return { closest: ~index };
  }

  private searchLeafValueIndex(
    values: { key: K; value: V }[],
    searchKey: K,
  ) {
    let left = 0;
    let right = values.length;

    while (left < right) {
      const mid = (left + right) >>> 1; // Fast integer division
      const cmp = this.compareKey(values[mid].key, searchKey);

      if (cmp === 0) return mid;
      if (cmp < 0) left = mid + 1;
      else right = mid;
    }

    return ~left;
  }

  private insertLeafValue(
    values: { key: K; value: V }[],
    item: { key: K; value: V },
  ) {
    const index = this.searchLeafValueIndex(values, item.key);

    if (index >= 0) {
      // Replace existing
      const oldItem = values[index];
      values[index] = item;
      return oldItem;
    } else {
      // Insert new
      values.splice(~index, 0, item);
      return undefined;
    }
  }
}

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

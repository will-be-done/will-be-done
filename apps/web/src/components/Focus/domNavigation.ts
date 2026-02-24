import type { FocusKey } from "@/store/focusSlice.ts";

// When columns are stacked vertically (data-focus-stacked), j/k overflows into
// the adjacent column at boundaries. Returns the boundary item key of the
// adjacent column in the given direction, or null if none exists.
const getStackedBoundaryItem = (
  column: Element,
  direction: "prev" | "next",
): FocusKey | null => {
  const stacked = column.closest("[data-focus-stacked]");
  if (!stacked) return null;

  // Only columns whose immediate data-focus-stacked ancestor is this container
  const allColumns = Array.from(
    stacked.querySelectorAll("[data-focus-column]"),
  ).filter((col) => col.closest("[data-focus-stacked]") === stacked);

  const colIndex = allColumns.indexOf(column as HTMLElement);
  if (colIndex === -1) return null;

  const adjacentCol =
    direction === "prev"
      ? colIndex > 0
        ? allColumns[colIndex - 1]!
        : null
      : colIndex < allColumns.length - 1
        ? allColumns[colIndex + 1]!
        : null;
  if (!adjacentCol) return null;

  if (direction === "next") {
    // First real item, fall back to placeholder
    const el =
      adjacentCol.querySelector(
        "[data-focusable-key]:not([data-focus-placeholder])",
      ) ?? adjacentCol.querySelector("[data-focusable-key]");
    return (el?.getAttribute("data-focusable-key") as FocusKey) ?? null;
  } else {
    // Last real item, fall back to placeholder
    const items = Array.from(
      adjacentCol.querySelectorAll(
        "[data-focusable-key]:not([data-focus-placeholder])",
      ),
    );
    if (items.length > 0) {
      return items[items.length - 1]!.getAttribute(
        "data-focusable-key",
      ) as FocusKey;
    }
    return (
      (adjacentCol
        .querySelector("[data-focusable-key]")
        ?.getAttribute("data-focusable-key") as FocusKey) ?? null
    );
  }
};

// Returns [prev, next] focusable keys within the same data-focus-column, in DOM order.
// When at a boundary inside a data-focus-stacked container, overflows into the
// adjacent stacked column so j/k crosses section boundaries.
export const getDOMSiblings = (
  key: string,
): [FocusKey | null, FocusKey | null] => {
  const el = document.querySelector(`[data-focusable-key="${key}"]`);
  if (!el) return [null, null];

  const column = el.closest("[data-focus-column]");
  if (!column) return [null, null];

  const isPlaceholder = el.hasAttribute("data-focus-placeholder");

  let prev: FocusKey | null = null;
  let next: FocusKey | null = null;

  if (!isPlaceholder) {
    // Exclude placeholder elements so j/k never navigates through them directly
    const allItems = Array.from(
      column.querySelectorAll("[data-focusable-key]:not([data-focus-placeholder])"),
    );
    const index = allItems.findIndex(
      (item) => item.getAttribute("data-focusable-key") === key,
    );
    if (index === -1) return [null, null];

    prev =
      index > 0
        ? (allItems[index - 1]!.getAttribute("data-focusable-key") as FocusKey)
        : null;
    next =
      index < allItems.length - 1
        ? (allItems[index + 1]!.getAttribute("data-focusable-key") as FocusKey)
        : null;
  }

  // Overflow into adjacent stacked column at boundaries
  if (prev === null) prev = getStackedBoundaryItem(column, "prev");
  if (next === null) next = getStackedBoundaryItem(column, "next");

  return [prev, next];
};

// Returns first focusable key in adjacent columns (left = prev, right = next in DOM order)
export const getDOMColumnSiblingFirstItems = (
  key: string,
): [FocusKey | null, FocusKey | null] => {
  const el = document.querySelector(`[data-focusable-key="${key}"]`);
  if (!el) return [null, null];

  const currentColumn = el.closest("[data-focus-column]");
  if (!currentColumn) return [null, null];

  const region = currentColumn.closest("[data-focus-region]") ?? document;
  const allColumns = Array.from(
    region.querySelectorAll("[data-focus-column]"),
  );
  const colIndex = allColumns.indexOf(currentColumn as HTMLElement);
  if (colIndex === -1) return [null, null];

  const getFirstKey = (col: Element | null): FocusKey | null => {
    if (!col) return null;
    // Prefer a real task; fall back to the column placeholder if the column is empty
    const firstItem =
      col.querySelector("[data-focusable-key]:not([data-focus-placeholder])") ??
      col.querySelector("[data-focusable-key]");
    return firstItem
      ? (firstItem.getAttribute("data-focusable-key") as FocusKey)
      : null;
  };

  return [
    getFirstKey(colIndex > 0 ? allColumns[colIndex - 1]! : null),
    getFirstKey(
      colIndex < allColumns.length - 1 ? allColumns[colIndex + 1]! : null,
    ),
  ];
};

// Returns model info for adjacent columns (for task move left/right)
export const getDOMAdjacentColumns = (
  key: string,
): [
  { id: string; type: string } | null,
  { id: string; type: string } | null,
] => {
  const el = document.querySelector(`[data-focusable-key="${key}"]`);
  if (!el) return [null, null];

  const currentColumn = el.closest("[data-focus-column]");
  if (!currentColumn) return [null, null];

  const region = currentColumn.closest("[data-focus-region]") ?? document;
  const allColumns = Array.from(
    region.querySelectorAll("[data-focus-column]"),
  );
  const colIndex = allColumns.indexOf(currentColumn as HTMLElement);
  if (colIndex === -1) return [null, null];

  const getColumnModel = (
    col: Element | null,
  ): { id: string; type: string } | null => {
    if (!col) return null;
    const id = col.getAttribute("data-column-model-id");
    const type = col.getAttribute("data-column-model-type");
    if (!id || !type) return null;
    return { id, type };
  };

  return [
    getColumnModel(colIndex > 0 ? allColumns[colIndex - 1]! : null),
    getColumnModel(
      colIndex < allColumns.length - 1 ? allColumns[colIndex + 1]! : null,
    ),
  ];
};

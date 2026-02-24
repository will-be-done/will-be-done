import type { FocusKey } from "@/store/focusSlice.ts";

// Returns [prev, next] focusable keys within the same data-focus-column, in DOM order
export const getDOMSiblings = (
  key: string,
): [FocusKey | null, FocusKey | null] => {
  const el = document.querySelector(`[data-focusable-key="${key}"]`);
  if (!el) return [null, null];

  const column = el.closest("[data-focus-column]");
  if (!column) return [null, null];

  // Exclude placeholder elements so j/k never navigates through empty-column sentinels
  const allItems = Array.from(
    column.querySelectorAll("[data-focusable-key]:not([data-focus-placeholder])"),
  );
  const index = allItems.findIndex(
    (item) => item.getAttribute("data-focusable-key") === key,
  );
  if (index === -1) return [null, null];

  const prev =
    index > 0
      ? (allItems[index - 1]!.getAttribute("data-focusable-key") as FocusKey)
      : null;
  const next =
    index < allItems.length - 1
      ? (allItems[index + 1]!.getAttribute("data-focusable-key") as FocusKey)
      : null;

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

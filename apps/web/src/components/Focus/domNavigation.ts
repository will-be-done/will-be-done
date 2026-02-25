import type { FocusKey } from "@/store/focusSlice.ts";

/**
 * DOM attributes used for keyboard focus navigation:
 *
 * data-focusable-key="<FocusKey>"
 *   Marks an element as a keyboard-navigable item (task card, project item, etc.).
 *   The value is a FocusKey string ("type^^id^^component"). j/k/h/l navigation
 *   reads and writes this attribute to track the focused item.
 *
 * data-focus-placeholder
 *   Applied alongside data-focusable-key on a zero-size sentinel element at the
 *   bottom of a column. j/k can navigate to it like any other item. h/l prefers
 *   real items but falls back to it when a column is empty. Pressing o/a while
 *   a placeholder is focused triggers task creation.
 *
 * data-focus-column
 *   Marks a container as a navigable column. getDOMSiblings scopes j/k within
 *   the nearest ancestor column. Also carries data-column-model-id and
 *   data-column-model-type so task move (ctrl+arrow) knows the target model.
 *
 * data-column-model-id / data-column-model-type
 *   Set on data-focus-column elements. Identifies the backing model (e.g. a
 *   dailyList or projectCategory) so tasks can be moved between columns.
 *
 * data-focus-region-direction="row" | "column"
 *   Wraps a group of data-focus-column elements and controls how navigation
 *   behaves at column boundaries:
 *
 *   "row"    – columns sit side-by-side (kanban board). h/l and task-move are
 *              scoped to columns within the same region, preventing bleed-over
 *              into other boards on the same page.
 *
 *   "column" – columns are stacked top-to-bottom (e.g. project category sections
 *              in mobile view). When j/k reaches the boundary of a column,
 *              navigation overflows into the adjacent stacked column.
 */

const REGION_SELECTOR = "[data-focus-region-direction]";

// When direction="column", j/k overflows into the adjacent column at boundaries.
// Returns the boundary item key of the adjacent column, or null if none.
const getStackedBoundaryItem = (
  column: Element,
  direction: "up" | "down",
  forMove = false,
): FocusKey | null => {
  const region = column.closest('[data-focus-region-direction="column"]');
  if (!region) return null;

  // Only columns whose immediate region ancestor is this container
  const allColumns = Array.from(
    region.querySelectorAll("[data-focus-column]"),
  ).filter((col) => col.closest(REGION_SELECTOR) === region);

  const colIndex = allColumns.indexOf(column as HTMLElement);
  if (colIndex === -1) return null;

  const adjacentCol =
    direction === "up"
      ? colIndex > 0
        ? allColumns[colIndex - 1]!
        : null
      : colIndex < allColumns.length - 1
        ? allColumns[colIndex + 1]!
        : null;
  if (!adjacentCol) return null;

  const realItemSelector = forMove
    ? "[data-focusable-key]:not([data-focus-placeholder]):not([data-ignore-drop])"
    : "[data-focusable-key]:not([data-focus-placeholder])";

  if (direction === "down") {
    // First real item, fall back to placeholder
    const el =
      adjacentCol.querySelector(realItemSelector) ??
      adjacentCol.querySelector("[data-focusable-key]");
    return (el?.getAttribute("data-focusable-key") as FocusKey) ?? null;
  } else {
    // Last real item, fall back to placeholder
    const items = Array.from(adjacentCol.querySelectorAll(realItemSelector));
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

// Returns [up, down] focusable keys within the same data-focus-column, in DOM order.
// When at a boundary inside a direction="column" region, overflows into the
// adjacent stacked column so j/k crosses section boundaries.
export const getDOMSiblings = (
  key: string,
  { forMove = false }: { forMove?: boolean } = {},
): [FocusKey | null, FocusKey | null] => {
  const el = document.querySelector(`[data-focusable-key="${key}"]`);
  if (!el) return [null, null];

  const column = el.closest("[data-focus-column]");
  if (!column) return [null, null];

  const selector = forMove
    ? "[data-focusable-key]:not([data-focus-placeholder]):not([data-ignore-drop])"
    : "[data-focusable-key]:not([data-focus-placeholder])";

  const allItems = Array.from(column.querySelectorAll(selector));
  const index = allItems.findIndex(
    (item) => item.getAttribute("data-focusable-key") === key,
  );

  if (index === -1) return [null, null];

  let up: FocusKey | null =
    index > 0
      ? (allItems[index - 1]!.getAttribute("data-focusable-key") as FocusKey)
      : null;
  let down: FocusKey | null =
    index < allItems.length - 1
      ? (allItems[index + 1]!.getAttribute("data-focusable-key") as FocusKey)
      : null;

  // Overflow into adjacent stacked column at boundaries
  if (up === null) up = getStackedBoundaryItem(column, "up", forMove);
  if (down === null) down = getStackedBoundaryItem(column, "down", forMove);

  return [up, down];
};

// Returns [left, right] focusable key in adjacent columns (row/kanban mode).
// Picks the item whose vertical midpoint is closest to the current item's midpoint,
// falling back to the column placeholder if the column is empty.
export const getDOMColumnSiblingFirstItems = (
  key: string,
): [FocusKey | null, FocusKey | null] => {
  const el = document.querySelector(`[data-focusable-key="${key}"]`);
  if (!el) return [null, null];

  const currentColumn = el.closest("[data-focus-column]");
  if (!currentColumn) return [null, null];

  const region =
    currentColumn.closest('[data-focus-region-direction="row"]') ?? document;
  const allColumns = Array.from(region.querySelectorAll("[data-focus-column]"));
  const colIndex = allColumns.indexOf(currentColumn as HTMLElement);
  if (colIndex === -1) return [null, null];

  const currentMidY = (() => {
    const r = el.getBoundingClientRect();
    return r.top + r.height / 2;
  })();

  const getClosestKey = (col: Element | null): FocusKey | null => {
    if (!col) return null;
    const items = Array.from(
      col.querySelectorAll("[data-focusable-key]:not([data-focus-placeholder])"),
    );
    if (items.length === 0) {
      // Empty column — fall back to placeholder
      const placeholder = col.querySelector("[data-focusable-key]");
      return placeholder
        ? (placeholder.getAttribute("data-focusable-key") as FocusKey)
        : null;
    }
    let closest: Element = items[0]!;
    let closestDist = Infinity;
    for (const item of items) {
      const r = item.getBoundingClientRect();
      const dist = Math.abs(r.top + r.height / 2 - currentMidY);
      if (dist < closestDist) {
        closestDist = dist;
        closest = item;
      }
    }
    return closest.getAttribute("data-focusable-key") as FocusKey;
  };

  return [
    getClosestKey(colIndex > 0 ? allColumns[colIndex - 1]! : null),
    getClosestKey(
      colIndex < allColumns.length - 1 ? allColumns[colIndex + 1]! : null,
    ),
  ];
};

// Returns the placeholder key of the adjacent stacked section (up/down).
// Used as a fallback drop target when no regular sibling is available for a move.
export const getDOMAdjacentStackedPlaceholder = (
  key: string,
  direction: "up" | "down",
): FocusKey | null => {
  const el = document.querySelector(`[data-focusable-key="${key}"]`);
  if (!el) return null;

  const column = el.closest("[data-focus-column]");
  if (!column) return null;

  const region = column.closest('[data-focus-region-direction="column"]');
  if (!region) return null;

  const allColumns = Array.from(
    region.querySelectorAll("[data-focus-column]"),
  ).filter((col) => col.closest(REGION_SELECTOR) === region);

  const colIndex = allColumns.indexOf(column as HTMLElement);
  if (colIndex === -1) return null;

  const adjacentCol =
    direction === "up"
      ? colIndex > 0 ? allColumns[colIndex - 1]! : null
      : colIndex < allColumns.length - 1 ? allColumns[colIndex + 1]! : null;
  if (!adjacentCol) return null;

  const placeholder = adjacentCol.querySelector(
    "[data-focus-placeholder][data-focusable-key]",
  );
  return (placeholder?.getAttribute("data-focusable-key") as FocusKey) ?? null;
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

  const region =
    currentColumn.closest('[data-focus-region-direction="row"]') ?? document;
  const allColumns = Array.from(region.querySelectorAll("[data-focus-column]"));
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

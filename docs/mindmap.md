# Mindmap Design and Invariants

This document is the normative design for mindmaps. Any change to the mindmap
schema, tree repair, placement, item links (Tasks and Notes), the v1 mindmap
API, or the canvas interaction model must preserve the invariants below. If an
invariant must change, update this document and the tests named here in the
same change.

Code lives in:

- `apps/slices/src/space/mindmaps.ts`: schema-level actions and selectors,
  tree repair, placement;
- `apps/slices/src/space/tables.ts`: `mindmapsTable`, `mindmapNodesTable`;
- `apps/api/src/services/mindmaps.ts`, `apps/api/src/http/v1/mindmaps.ts`:
  the v1 API;
- `apps/web/src/components/Mindmap/`: layout, canvas, node cards, drag and
  drop.

## Model

A mindmap is a tree drawn around a central topic. The central topic is not a
node: the `mindmaps` row is the root, and its `title`/`titleDoc` are the
central topic's text.

Every other node is a `mindmap_nodes` row:

| Field        | Meaning                                                           |
| ------------ | ----------------------------------------------------------------- |
| `mindmapId`  | Owning map.                                                       |
| `parentId`   | The mindmap ID for a main branch, otherwise the parent node's ID. |
| `orderToken` | Fractional key among siblings of the same parent.                 |
| `side`       | `left` or `right` of the root. Read on main branches only.        |
| `taskId`     | Linked Task, or `null`.                                           |
| `noteId`     | Linked Note. Optional; absent means no note.                      |
| `title(Doc)` | Topic text. Empty on task and note nodes.                         |
| `collapsed`  | Children are hidden in the layout.                                |

A node is exactly one kind:

- **topic**: neither `taskId` nor `noteId`; it owns its title;
- **task**: `taskId` set; it shows and edits the Task's title and state;
- **note**: `noteId` set; it shows and edits the Note's title.

Only structure is stored. Positions, sizes, branch colors, and depth are
derived on the client and never synced.

`noteId` is optional rather than `string | null` because rows written before
notes could join a map lack the field, and HyperDB validates rows on read. A
required field would make those rows unreadable. New code must omit `noteId`
rather than write `undefined` or `null`, and must strip it when a node stops
being a note.

Indexes: `byMindmapParentOrder` (`mindmapId, parentId, orderToken`) reads a
map or a sibling list; `byTaskId` and `byNoteId` find the nodes of an item
across maps. All reads in request paths go through these indexes.

## Reading the Tree

`mindmapTree` loads one map's nodes by index, batches the linked Tasks, Notes,
their sections, and projects, and passes them to `buildMindmapTree`, which puts
each item's `project` and `section` on its tree node. The tree is
the only shape the UI and the v1 API expose.

Concurrent edits are merged field by field (see `docs/sync.md`), so the stored
rows can describe something that is not a tree. `buildMindmapTree` repairs it
on read, never by writing fixes back, so every replica derives the same
picture from the same rows:

- a node whose parent is missing, or belongs to another map, is a main branch;
- a parent cycle is broken at its smallest node ID, which becomes a main
  branch;
- a task or note node whose item is gone is hidden, and its children take its
  place in its sibling list;
- a node that links both a Task and a Note (two devices converted the same
  topic concurrently) shows the Task, and shows the Note only if the Task is
  gone.

Siblings sort by `orderToken`, then by ID. The result must not depend on input
row order. `buildMindmapTree repairs orphans, cycles and missing tasks the same
way in any order` and `a node linking a task and a note shows whichever exists,
task first` cover these rules.

## Placement

Every create and move takes a `MindmapPlacement`:

- `{ parentId, position: "first" | "last", side? }`: under a node, or under
  the map ID for a main branch;
- `{ siblingId, edge: "before" | "after" }`: next to a node, under the same
  parent.

`resolvePlacement` turns a placement into `parentId`, `side`, and order keys:

- keys come from `generateNJitteredKeysBetween`, so a multi-node move gets
  consecutive keys in one step;
- a main branch with no explicit side goes to the side with fewer branches,
  right on a tie;
- a deeper node takes its parent's side; a sibling placement takes the
  sibling's side;
- nodes being moved are excluded from the sibling list before keys are chosen.

`moveMindmapNodes` moves a selection:

- only selection roots move (a selected node under another selected node
  travels with its ancestor);
- roots keep their depth-first map order;
- a sibling target inside the selection is a no-op;
- a target inside a moving subtree throws. The API checks this first and
  returns 409.

## Tasks and Notes on Maps

A Task or Note appears at most once per map. `createMindmapNode` with a
`taskId` or `noteId` already on that map moves the existing node instead of
adding a second one. It throws if both IDs are given or the item is missing.

Removing a node, a subtree, or a whole map (`deleteMindmapNodes`,
`deleteMindmap`) deletes only `mindmap_nodes` rows. Tasks and Notes stay in
their projects. There is no confirmation dialog for removing nodes.

Items created from a map go to the **first** section of the project shown in
the page's bottom panel (the `projectId` argument), or of the inbox when none
is given or the project is gone (`sectionForNewItem`). It is the first section
rather than a fixed one because sections, including the inbox's original one,
can be deleted:

- `createMindmapTask` / `createMindmapNote` create an empty item and place it;
- `convertMindmapNodeToTask` / `convertMindmapNodeToNote` turn a topic into an
  item with the topic's title and clear the node's own title; only topics
  convert;
- `convertMindmapNodeToTopic` unlinks a task or note node into a topic with the
  item's current title; the item stays.

Item lifecycle hooks keep maps consistent; any new path that deletes or
replaces a Task or Note must go through them:

- `deleteTasks` and `deleteNotes` call `detachMindmapNodesOfItems`: the item's
  nodes are deleted and each node's children are re-parented into its place,
  so topics placed under an item are not lost;
- `trashTasks` and `trashNotes` store the item's nodes in the trash snapshot
  (`mindmapNodes`, optional for older snapshots) before deleting;
- `restoreTrashedTasks` re-inserts those nodes into maps that still exist.
  Children lifted when the item was trashed stay where they are; a restored
  node whose parent is gone shows as a main branch;
- `convertTaskToNote` and `convertNoteToTask` replace the row with a new ID.
  They call `relinkMindmapNodes` before deleting the old row, so the node, its
  place, and its children follow the new item.

`mindmapsOfItem` lists the maps an item appears on; the details panel shows it
for Tasks and Notes.

Tests: `new tasks, notes and converted topics go to the chosen project or the
inbox`, `a note node
survives trash and task conversion, and unlinks to a topic`, `trashing a task
lifts its children and restoring brings it back`.

## Sync, Storage, and Backup

- Both tables are registered space-syncable tables and merge with the generic
  per-field rules only. There is no mindmap-specific merge code; read-time
  repair (above) is what makes concurrent results acceptable.
- The web client preloads both tables by `byIds`.
- Backups include `mindmaps` and `mindmapNodes`. Loading a backup skips nodes
  whose map is missing or whose linked item is not live in the backup.
  `noteId` is optional in the backup schema for the same reason it is optional
  in the table.
- Trash snapshots are validated on backup load: every stored node must link
  the trashed item.

## v1 API

| Operation           | Route                                              |
| ------------------- | -------------------------------------------------- |
| `listMindmaps`      | `GET /spaces/:spaceId/mindmaps`                    |
| `createMindmap`     | `POST /spaces/:spaceId/mindmaps`                   |
| `getMindmap`        | `GET /spaces/:spaceId/mindmaps/:mindmapId`         |
| `updateMindmap`     | `PATCH /spaces/:spaceId/mindmaps/:mindmapId`       |
| `deleteMindmap`     | `DELETE /spaces/:spaceId/mindmaps/:mindmapId`      |
| `createMindmapNode` | `POST /spaces/:spaceId/mindmaps/:mindmapId/nodes`  |
| `updateMindmapNode` | `PATCH /spaces/:spaceId/mindmap-nodes/:nodeId`     |
| `moveMindmapNode`   | `POST /spaces/:spaceId/mindmap-nodes/:nodeId/move` |
| `deleteMindmapNode` | `DELETE /spaces/:spaceId/mindmap-nodes/:nodeId`    |

- `getMindmap` returns nodes depth-first from the repaired tree, so clients see
  what the apps show. `parentId` is `null` for main branches.
- A node reports `kind` (`topic`, `task`, `note`), `taskId`, `noteId` (`null`
  when absent), and `title`, which is the item's title for task and note nodes.
- `createMindmapNode` takes exactly one of `title`, `taskId`, `noteId`.
- Renaming a task or note node through `updateMindmapNode` is a 409; rename the
  item instead.
- The API does not expose topic conversion; it is a client action.

`apps/api/src/e2e/mindmaps.test.ts` covers every operation, including a note
node that keeps its place when the note is converted to a task.

## Client

### Page

The view-switcher tab is behind a per-device setting, `useMindmapsEnabled`
(localStorage, off by default, Settings → General). It hides only the tab:
mindmap routes, links (such as the details panel's mindmaps row), sync, and
the API work the same either way.

`/spaces/:spaceId/mindmaps/:mindmapId?projectId=…` shows the canvas, a project
panel at the bottom (the `projectId` search param picks the project; `inbox`
is an alias), and the item details panel on the right. Tasks and Notes are
dragged from the project panel or the stash onto the canvas. The stash sits at
the canvas's left edge (`WithStash`) and pushes the canvas aside when open.

Creating a map must open it without a visible delay (`useCreateMindmap`):

- the route has a loader, and without a pending component the router keeps
  the old page until the loader and the route code are ready. The next map's
  ID is therefore chosen ahead of time, and hovering or focusing a "New
  mindmap" control preloads that map's route;
- the click starts `createMindmap` with that ID and navigates in the same tick,
  without awaiting the write;
- until the write commits, the page draws the map from the pending row in
  `useCreatingMindmaps` (a new map is always empty), so it never shows "This
  mindmap was deleted" for a map that is still being created.

### Layout

`layoutMindmap` is a pure function of the tree and measured node sizes:

- main branches fan out left and right of the root, by `side`;
- every subtree stacks its visible children vertically, centered on the parent;
- gaps: 64 from the root, 40 between levels, 8 between siblings, 20 between
  main branches;
- collapsed nodes hide their children and report `hiddenCount`.

Node sizes come from a `ResizeObserver` store (`nodeSizes.ts`) read with
`useSyncExternalStore`. Unmeasured nodes use an estimate; observations arrive
before paint, so a frame laid out with estimates never shows.

The canvas is DOM node cards plus one SVG edge layer inside a CSS-transformed
world. Pan: wheel, Shift+wheel horizontally, or middle-button drag. Zoom:
Ctrl/Meta+wheel or the zoom buttons, clamped to 0.2–2.5.

### Focus Keys

- root: `(mindmapId, "mindmap")`;
- topic: `(nodeId, "mindmapNode")`;
- task node: `(taskId, "task", nodeId)`;
- note node: `(noteId, "note", nodeId)`.

Task and note nodes use their item's key so the details panel opens the item;
the node ID keeps the key distinct from the same item shown in a project list.

### Keyboard

New nodes match the kind of the node they are created from: a topic makes
topics, a task makes tasks, a note makes notes, created in the bottom panel's
project. On the root, new nodes are topics.

| Keys                      | Action                                         |
| ------------------------- | ---------------------------------------------- |
| `Tab`                     | Add a child, last; expands a collapsed parent. |
| `Enter`, `o`              | Add a sibling below. On the root: a branch.    |
| `Shift+O`                 | Add a sibling above.                           |
| `i`, double-click         | Edit the title.                                |
| `h j k l`, arrows         | Move focus by on-screen position.              |
| `Ctrl` + `h j k l`/arrows | Move the node in the tree (`treeMoveOf`).      |
| `Space`                   | Toggle a task.                                 |
| `m`                       | Move the task or note to another project.      |
| `s`                       | Open the date picker on a task node.           |
| `t`                       | Schedule a task for today.                     |
| `r`                       | Reset a task's schedule.                       |
| `Shift+S`                 | Stash a todo task.                             |
| `e`                       | Edit the item's description in details.        |
| `a`                       | Open the node's "…" menu.                      |
| `.`                       | Collapse or expand.                            |
| `d`, `x`, `Backspace`     | Remove the node (or the selection) and below.  |
| `Escape`                  | Clear the selection, then focus.               |

The "…" menu (`MindmapNodeMenu`) sits in the hover toolbar, which stays shown
while the menu is open (`useMindmapMenu`). It calls the same actions as the
keys, plus two only it offers: converting a task to a note or back (the node
keeps its place through `relinkMindmapNodes`) and deleting the item to the
trash. Task and note nodes show "project · section · date"
(`MindmapItemPlace`); the project opens the move dialog and the section a
picker of that project's sections.

Item keys (`m s t r Shift+S e`) reuse the project-list actions
(`moveTaskToProject`/`moveNoteToProject`, `TaskDatePicker`, `scheduleTask`,
`removeFromDailyList`, the stash column drop, the details description request),
so they behave the same as on a task in a list. Keys a map node cannot show the
result of are not bound: nature (`1 2 3`), checklist (`c`), the action menu
(`a`), and template conversion (`Shift+T`). Task nodes show their scheduled date
next to the project.

`treeMoveOf` maps a screen direction to a placement, by the node's branch side:

- up/down: before the previous sibling or after the next one; main branches
  only count siblings on the same side;
- away from the root: last child of the sibling above (expanding it if
  collapsed); no sibling above is a no-op;
- toward the root: after the parent; a main branch moves to the other side
  instead.

`mindmapModel.test.ts` covers `treeMoveOf`.

The canvas handler ignores keys whose DOM target is outside the viewport.
Popovers and dialogs (the date picker, the move dialog) portal out of the
viewport, but React still bubbles their key events to it. The move dialog runs
with `keepsFocus`, because the node stays on the map after its item moves.

A topic left empty with no children is discarded when editing ends; an empty
task or note is kept, as in project lists. Removing nodes focuses the nearest
surviving ancestor.

### Selection

`useMindmapSelection` holds the selected node IDs. Left-drag on empty canvas
draws a marquee and selects intersecting non-root nodes; Shift/Meta/Ctrl makes
it additive, and a modifier-click toggles one node. A plain click clears the
selection. Dragging a selected node drags the whole selection; dragging an
unselected node clears it. The node toolbar shows on hover as well as focus.

### Drag and Drop

The viewport is the only drop target; node cards are only drag sources. A
monitor clears the preview on any drop or cancel.

Drag sources are mindmap nodes of the same map (`mindmapNodeDrag` data with
node IDs) and model drags carrying a Task (tasks, daily entries, stash entries)
or a Note. An item already on the map is treated as a drag of its node.

While dragging, the drop is previewed in place: `withDropGhosts` inserts
dashed placeholder leaves where the items would land, the moving originals and
their edges are faded, and the target parent is highlighted.

**Anti-flicker invariant.** `dropIntentAt` must pick the drop from the base
layout, the one without the preview. Picking on the preview lets each preview
move the target, which flips the next pick under a still pointer. On the base
layout:

- the nearest node within 48 map units is the target; beyond that the drop
  starts a main branch on the pointer's side;
- a target inside the dragged subtrees refuses the drop;
- the root always takes a child;
- the middle half of a node nests under it, the top and bottom quarters place
  before and after it.

Nesting leaves the target in place, and a sibling placeholder opens centered
on the pointer, so the pointer always rests on the target or its placeholder.
`mindmapModel.test.ts` checks this over a grid of pointer positions.

## Rules for Future Changes

- Keep repair in `buildMindmapTree`. Do not write repairs back during reads,
  and do not add merge rules for mindmap tables without updating
  `docs/sync.md`.
- Any new way to delete, trash, restore, or replace a Task or Note must keep
  its mindmap nodes consistent through the hooks above.
- Any new linkable item type needs: a link field that is optional on existing
  rows, an index, a tree rule for when the link and the item disagree, the
  lifecycle hooks, backup and trash support, an API `kind`, a focus key, drag
  support, and an update to this document.
- Drop picks must stay independent of the preview layout.
- Keep request-path reads bounded by one map or an item's indexed nodes.

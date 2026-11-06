import { useAsyncDispatch, useSelectAsync } from "@will-be-done/hyperdb/react";
import {
  isNote,
  isTask,
  itemsOfListItems,
  type ListItemType,
  type MindmapNode,
  type MindmapTreeNode,
  pasteMindmapNodes,
  pasteMindmapOutline,
  placeMindmapItems,
  updateMindmapNode,
} from "@will-be-done/slices/space";
import { richTextMarkdownToPlainText } from "@will-be-done/slices/common";
import {
  buildFocusKey,
  type FocusKey,
  parseColumnKey,
  useFocusStore,
} from "@/store/focusSlice.ts";
import { useClipboardStore } from "@/components/Selection/clipboard";
import { isInputElement } from "@/utils/isInputElement.ts";
import {
  type CanvasIndex,
  type CanvasNode,
  useMindmapSelection,
} from "./mindmapModel.ts";
import { clipboardOutline } from "./clipboardOutline.ts";
import { mindmapNodeFocusKey } from "./focusKeys.ts";

// Copy, cut, and paste on the canvas. The events are handled here and marked,
// so the list handlers skip them.
export function useMindmapClipboard({
  mindmapId,
  index,
  focusNode,
}: {
  mindmapId: string;
  index: CanvasIndex;
  focusNode: (key: FocusKey, keepSelection?: boolean) => void;
}) {
  const dispatch = useAsyncDispatch();
  const select = useSelectAsync();

  // Clipboard events reach nodes only when no text field or text selection
  // would take them. Handled events are marked, so the list handlers skip
  // them.
  const clipboardTarget = (e: React.ClipboardEvent) => {
    const focus = useFocusStore.getState();
    if (
      focus.isFocusDisabled ||
      focus.editItemKey ||
      !e.clipboardData ||
      (e.target instanceof Element && isInputElement(e.target)) ||
      !(window.getSelection()?.isCollapsed ?? true)
    ) {
      return null;
    }
    return focus.focusItemKey
      ? index.byFocusKey.get(focus.focusItemKey)
      : undefined;
  };

  const handleCopy = (e: React.ClipboardEvent, mode: "copy" | "cut") => {
    const focusedId = clipboardTarget(e);
    if (focusedId === null) return;
    const selection = useMindmapSelection.getState().ids;
    const picked = new Set(
      selection.size > 0 ? selection : focusedId ? [focusedId] : [],
    );
    // In map order; the central topic stays.
    const entries = [...index.nodes.values()].filter(
      (entry): entry is CanvasNode & { kind: "node" } =>
        entry.kind === "node" && picked.has(entry.id),
    );
    if (entries.length === 0) return;

    // An indented outline, for pasting as text elsewhere.
    const lines: string[] = [];
    const outline = (tree: MindmapTreeNode, depth: number) => {
      const title = (tree.task ?? tree.note ?? tree.node).title;
      lines.push(
        "  ".repeat(depth) + richTextMarkdownToPlainText(title, "title"),
      );
      for (const child of tree.children) outline(child, depth + 1);
    };
    const isUnderPicked = (entry: CanvasNode & { kind: "node" }) => {
      let parentId = entry.parentId;
      while (parentId !== null) {
        if (picked.has(parentId)) return true;
        const parent = index.nodes.get(parentId);
        parentId = parent?.kind === "node" ? parent.parentId : null;
      }
      return false;
    };
    // A paste copies these nodes, so children added later stay out.
    const nodeIds: string[] = [];
    const collect = (tree: MindmapTreeNode) => {
      nodeIds.push(tree.node.id);
      tree.children.forEach(collect);
    };
    for (const entry of entries) {
      if (isUnderPicked(entry)) continue;
      outline(entry.tree, 0);
      collect(entry.tree);
    }
    const text = lines.join("\n");

    e.preventDefault();
    e.clipboardData.setData("text/plain", text);
    useClipboardStore.setState({
      clipboard: {
        mode,
        keys: [
          ...new Set(
            entries.flatMap(({ tree }) => {
              const item = tree.task ?? tree.note;
              return item ? [buildFocusKey(item.id, item.type)] : [];
            }),
          ),
        ],
        text,
        mindmap: { mindmapId, nodeIds },
      },
    });
  };

  // Pastes under the focused node, or the central topic, and selects what
  // was pasted. Items copied in a list are placed on the map, not copied;
  // anything else pastes as an outline of new topics.
  const handlePaste = (e: React.ClipboardEvent) => {
    const focusedId = clipboardTarget(e);
    if (focusedId === null) return;
    const text = e.clipboardData.getData("text/plain");
    const normalize = (text: string) => text.replace(/\r\n/g, "\n");
    const stored = useClipboardStore.getState().clipboard;
    const clipboard =
      stored && normalize(text) === normalize(stored.text) ? stored : null;
    const lines = clipboard ? [] : clipboardOutline(e.clipboardData);
    if (!clipboard && lines.length === 0) return;
    e.preventDefault();

    const targetId = focusedId ?? mindmapId;
    const target = index.nodes.get(targetId);
    if (clipboard?.mode === "cut") {
      // A cut cannot go into itself.
      const cutIds = new Set(
        clipboard.mindmap?.mindmapId === mindmapId
          ? clipboard.mindmap.nodeIds
          : [],
      );
      for (
        let at: CanvasNode | undefined = target;
        at?.kind === "node";
        at = at.parentId === null ? undefined : index.nodes.get(at.parentId)
      ) {
        if (cutIds.has(at.id)) return;
      }
      useClipboardStore.setState({ clipboard: null });
    }
    if (target?.kind === "node" && target.tree.node.collapsed) {
      void dispatch(
        updateMindmapNode({ id: targetId, node: { collapsed: false } }),
      );
    }

    const placement = { parentId: targetId, position: "last" } as const;
    void (async () => {
      let pasted: MindmapNode[];
      if (!clipboard) {
        pasted = await dispatch(
          pasteMindmapOutline({ mindmapId, lines, placement }),
        );
      } else if (clipboard.mindmap) {
        pasted = await dispatch(
          pasteMindmapNodes({
            mindmapId,
            ids: clipboard.mindmap.nodeIds,
            placement,
            mode: clipboard.mode,
          }),
        );
      } else {
        const items = await select({
          selector: itemsOfListItems,
          args: {
            listItems: clipboard.keys.map((key) => {
              const { id, type } = parseColumnKey(key);
              return { id, modelType: type as ListItemType };
            }),
          },
        });
        pasted = await dispatch(
          placeMindmapItems({
            mindmapId,
            items: items.flatMap((item) =>
              isTask(item) || isNote(item)
                ? [{ type: item.type, id: item.id }]
                : [],
            ),
            placement,
          }),
        );
      }
      const last = pasted.at(-1);
      if (!last) return;
      focusNode(mindmapNodeFocusKey(last));
      if (pasted.length > 1) {
        useMindmapSelection
          .getState()
          .setIds(
            new Set(pasted.map((node) => node.id)),
            pasted[0]?.id ?? null,
          );
      }
    })();
  };

  return {
    onCopy: (e: React.ClipboardEvent) => handleCopy(e, "copy"),
    onCut: (e: React.ClipboardEvent) => handleCopy(e, "cut"),
    onPaste: handlePaste,
  };
}

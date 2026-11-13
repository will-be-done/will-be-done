import {
  CornerDownRight,
  Ellipsis,
  Info,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  Divider,
  MobileToolbar,
  ToolbarButton,
} from "@/components/Task/MobileTaskToolbar.tsx";
import { useIsMobile } from "@/hooks/use-mobile.ts";
import { useOpenItemPage } from "@/components/ItemPage/useOpenItemPage.ts";
import { useFocusStore } from "@/store/focusSlice.ts";
import type { MindmapNodeActions } from "./MindmapNodeCard.tsx";
import {
  type CanvasIndex,
  isFloatingRoot,
  useMindmapMenu,
} from "./mindmapModel.ts";

// What the keys and the hover toolbar do, in reach of a thumb. The node's
// menu holds the rest.
export function MindmapMobileToolbar({
  index,
  actions,
}: {
  index: CanvasIndex;
  actions: MindmapNodeActions;
}) {
  const isMobile = useIsMobile();
  const openItemPage = useOpenItemPage();
  const focusKey = useFocusStore((s) =>
    s.isFocusDisabled || s.editItemKey ? null : s.focusItemKey,
  );
  const id = focusKey ? index.byFocusKey.get(focusKey) : undefined;
  const entry = id === undefined ? undefined : index.nodes.get(id);
  const item =
    entry?.kind === "node" ? (entry.tree.task ?? entry.tree.note) : undefined;
  const isRoot = entry?.kind === "root" || isFloatingRoot(entry);

  return (
    <MobileToolbar visible={isMobile && entry !== undefined}>
      {entry && (
        <>
          <ToolbarButton
            icon={<Plus size={18} />}
            label={isRoot ? "Add branch" : "Add child"}
            onPress={() => actions.addChild(entry.id)}
          />
          {!isRoot && (
            <>
              <Divider />
              <ToolbarButton
                icon={<CornerDownRight size={18} />}
                label="Add below"
                onPress={() => actions.addSibling(entry.id, "after")}
              />
            </>
          )}
          <Divider />
          <ToolbarButton
            icon={<Pencil size={18} />}
            label="Edit"
            onPress={() => useFocusStore.getState().editByKey(entry.focusKey)}
          />
          {item && (
            <>
              <Divider />
              <ToolbarButton
                icon={<Info size={18} />}
                label="Details"
                onPress={() => openItemPage(item)}
              />
            </>
          )}
          {entry.kind === "node" && (
            <>
              <Divider />
              <ToolbarButton
                icon={<Ellipsis size={18} />}
                label="More"
                onPress={() => useMindmapMenu.getState().setNodeId(entry.id)}
              />
              <Divider />
              <ToolbarButton
                icon={<Trash2 size={18} />}
                label="Remove"
                onPress={() => actions.remove(entry.id)}
                destructive
              />
            </>
          )}
        </>
      )}
    </MobileToolbar>
  );
}

import { useAsyncDispatch, useSelectAsync } from "@will-be-done/hyperdb/react";
import { Trash2, Info } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useFocusStore, parseColumnKey } from "@/store/focusSlice.ts";
import { getDOMSiblings } from "@/components/Focus/domNavigation.ts";
import {
  appDeleteModel,
  dailyEntryDateOfTask,
  dailyEntryType,
  isTask,
  itemByListItemId,
  type ListItemType,
  stashEntryType,
  taskTemplateType,
  taskType,
} from "@will-be-done/slices/space";
import { useIsMobile } from "@/hooks/use-mobile.ts";
import { cn } from "@/lib/utils";
import { Route as SpaceRoute } from "@/routes/spaces.$spaceId.tsx";
import { captureWebAnalytics } from "@/lib/analytics";
import { differenceInCalendarDays } from "date-fns";

const isListItemType = (type: string): type is ListItemType =>
  type === taskType ||
  type === taskTemplateType ||
  type === dailyEntryType ||
  type === stashEntryType;

export const MobileTaskToolbar = () => {
  const isMobile = useIsMobile();
  const dispatch = useAsyncDispatch();
  const select = useSelectAsync();
  const navigate = useNavigate();
  const { spaceId } = SpaceRoute.useParams();
  const focusKey = useFocusStore((s) => s.focusItemKey);

  const parsed = focusKey ? parseColumnKey(focusKey) : null;
  const isItemFocused = parsed != null && isListItemType(parsed.type);
  const visible = isMobile && isItemFocused;

  const handleDelete = () => {
    if (!focusKey || !parsed) return;
    if (!isListItemType(parsed.type)) return;
    if (!confirm("Delete this task?")) return;
    const { id, type: modelType } = parsed;
    const [upKey, downKey] = getDOMSiblings(focusKey as string);
    void (async () => {
      const item = await select({
        selector: itemByListItemId,
        args: { id, modelType },
      });
      const scheduleDate =
        modelType === dailyEntryType && item && isTask(item)
          ? await select({
              selector: dailyEntryDateOfTask,
              args: { taskId: item.id },
            })
          : undefined;

      await dispatch(appDeleteModel({ id, modelType }));
      if (modelType === taskType && item && isTask(item)) {
        captureWebAnalytics({
          name: "task_deleted",
          properties: {
            age_hours: Math.max(
              0,
              Math.round(((Date.now() - item.createdAt) / 3_600_000) * 10) / 10,
            ),
            deletion_method: "web",
            previous_state: item.state,
          },
        });
      } else if (modelType === dailyEntryType && scheduleDate) {
        captureWebAnalytics({
          name: "task_unscheduled",
          properties: {
            previous_days_ahead: differenceInCalendarDays(
              scheduleDate,
              new Date(),
            ),
            unscheduling_method: "delete_daily_entry",
          },
        });
      }
    })();
    if (downKey) {
      useFocusStore.getState().focusByKey(downKey);
    } else if (upKey) {
      useFocusStore.getState().focusByKey(upKey);
    } else {
      useFocusStore.getState().resetFocus();
    }
  };

  const handleDetails = () => {
    if (!parsed) return;

    void (async () => {
      if (!isListItemType(parsed.type)) return;

      const item = await select({
        selector: itemByListItemId,
        args: { id: parsed.id, modelType: parsed.type },
      });
      if (!item) return;

      await navigate({
        to: "/spaces/$spaceId/item-details/$itemId",
        params: { spaceId, itemId: item.id },
      });
    })();
  };

  return (
    <div
      className={cn(
        "fixed bottom-0 inset-x-0 z-50 transition-transform duration-200 ease-out",
        visible ? "translate-y-0" : "translate-y-full",
      )}
    >
      {/* Hairline top border */}
      <div
        style={{
          height: "1px",
          background:
            "linear-gradient(90deg, transparent 0%, oklch(100% 0 0 / 0.12) 20%, oklch(100% 0 0 / 0.12) 80%, transparent 100%)",
        }}
      />

      {/* Toolbar body */}
      <div
        className="flex items-center"
        style={{
          background: "oklch(18% 0.03 260 / 0.96)",
          backdropFilter: "blur(24px) saturate(1.4)",
          WebkitBackdropFilter: "blur(24px) saturate(1.4)",
          paddingBottom: "max(8px, env(safe-area-inset-bottom))",
        }}
      >
        <ToolbarButton
          icon={<Trash2 size={18} />}
          label="Delete"
          onPress={handleDelete}
          destructive
        />
        <Divider />
        <ToolbarButton
          icon={<Info size={18} />}
          label="Task details"
          onPress={handleDetails}
        />
      </div>
    </div>
  );
};

const Divider = () => (
  <div
    style={{
      width: "1px",
      height: "24px",
      background: "oklch(100% 0 0 / 0.08)",
      flexShrink: 0,
    }}
  />
);

const ToolbarButton = ({
  icon,
  label,
  onPress,
  destructive = false,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) => (
  <button
    onPointerDown={(e) => {
      e.preventDefault();
      onPress();
    }}
    className={cn(
      "group flex flex-1 flex-col items-center justify-center gap-1 py-2 cursor-pointer",
      "transition-colors duration-100 active:bg-white/5",
    )}
    style={{ color: "oklch(92% 0.01 260)" }}
  >
    <span
      className={cn(
        "transition-colors duration-100",
        destructive
          ? "group-active:text-red-400"
          : "group-active:text-blue-400",
      )}
    >
      {icon}
    </span>
    <span
      className={cn(
        "text-[11px] font-medium tracking-wide transition-colors duration-100",
        destructive
          ? "group-active:text-red-400"
          : "group-active:text-blue-400",
      )}
      style={{ letterSpacing: "0.03em" }}
    >
      {label}
    </span>
  </button>
);

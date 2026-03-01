import { useDispatch, useSyncSelector } from "@will-be-done/hyperdb";
import { Trash2, Info, RotateCw } from "lucide-react";
import { focusSlice, parseColumnKey } from "@/store/focusSlice.ts";
import { getDOMSiblings } from "@/components/Focus/domNavigation.ts";
import { appSlice } from "@will-be-done/slices/space";
import { useIsMobile } from "@/hooks/use-mobile.ts";
import { cn } from "@/lib/utils";

const CARD_TYPES = new Set(["task", "template", "projection"]);

export const MobileTaskToolbar = () => {
  const isMobile = useIsMobile();
  const dispatch = useDispatch();
  const focusKey = useSyncSelector(() => focusSlice.getFocusKey(), []);

  const parsed = focusKey ? parseColumnKey(focusKey) : null;
  const isCardFocused = parsed != null && CARD_TYPES.has(parsed.type);
  const visible = isMobile && isCardFocused;

  const handleDelete = () => {
    if (!focusKey || !parsed) return;
    if (!confirm("Delete this task?")) return;
    const [upKey, downKey] = getDOMSiblings(focusKey as string);
    dispatch(appSlice.delete(parsed.id, parsed.type));
    if (downKey) {
      dispatch(focusSlice.focusByKey(downKey));
    } else if (upKey) {
      dispatch(focusSlice.focusByKey(upKey));
    } else {
      dispatch(focusSlice.resetFocus());
    }
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
          label="Details"
          onPress={() => {}}
        />
        <Divider />
        <ToolbarButton
          icon={<RotateCw size={18} />}
          label="Repeat"
          onPress={() => {}}
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
        destructive ? "group-active:text-red-400" : "group-active:text-blue-400",
      )}
    >
      {icon}
    </span>
    <span
      className={cn(
        "text-[11px] font-medium tracking-wide transition-colors duration-100",
        destructive ? "group-active:text-red-400" : "group-active:text-blue-400",
      )}
      style={{ letterSpacing: "0.03em" }}
    >
      {label}
    </span>
  </button>
);

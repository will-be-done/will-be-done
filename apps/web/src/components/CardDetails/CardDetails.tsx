import { useEffect, useRef, useState, useCallback } from "react";
import { ChevronDown, ChevronUp, GripHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSyncSelector } from "@will-be-done/hyperdb";
import { useFocusStore, parseColumnKey } from "@/store/focusSlice.ts";
import {
  projectCategoryCardsSlice,
  cardsSlice,
  isTask,
  isTaskTemplate,
} from "@will-be-done/slices/space";
import { useGlobalListener } from "@/components/GlobalListener/hooks.tsx";
import { AnimatePresence, motion } from "motion/react";
import { TaskBody } from "./TaskBody.tsx";
import { TemplateBody } from "./TemplateBody.tsx";

// ─── Persistent position (survives task switches) ─────────────────────────────
let savedPosition: { x: number; y: number } | null = null;

const PANEL_W = 288; // w-72

function defaultPosition(): { x: number; y: number } {
  const x = Math.max(
    0,
    Math.min(window.innerWidth - PANEL_W, window.innerWidth - PANEL_W - 16),
  );
  const y = Math.max(
    0,
    Math.min(window.innerHeight - 100, window.innerHeight - 450 - 16),
  );
  return { x, y };
}

// ─── Main floating panel ──────────────────────────────────────────────────────

export function CardDetails() {
  // Use getFocusKey (not isSomethingFocused) so panel stays visible while
  // MoveModal has focus disabled.
  const focusKey = useFocusStore((s) => s.focusItemKey);
  const parsed = focusKey ? parseColumnKey(focusKey) : null;
  const isCardFocused =
    parsed?.type === "task" ||
    parsed?.type === "projection" ||
    parsed?.type === "template";
  const cardId = isCardFocused ? parsed.id : null;
  const isVisible = useSyncSelector(
    () => cardsSlice.exists(cardId || ""),
    [cardId],
  );

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const isEditingTitle = editingTaskId === cardId;
  const setIsEditingTitle = useCallback(
    (v: boolean) => setEditingTaskId(v ? cardId : null),
    [cardId],
  );
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    if (!savedPosition) savedPosition = defaultPosition();
    return savedPosition;
  });

  const isDraggingRef = useRef(false);
  const startPointerRef = useRef({ x: 0, y: 0 });
  const startPositionRef = useRef({ x: 0, y: 0 });

  const clampPosition = useCallback(
    (x: number, y: number) => ({
      x: Math.max(0, Math.min(window.innerWidth - PANEL_W, x)),
      y: Math.max(0, Math.min(window.innerHeight - 100, y)),
    }),
    [],
  );

  const updatePosition = useCallback((pos: { x: number; y: number }) => {
    savedPosition = pos;
    setPosition(pos);
  }, []);

  // Keep panel inside viewport on window resize
  useEffect(() => {
    const onResize = () => {
      if (savedPosition) {
        const clamped = clampPosition(savedPosition.x, savedPosition.y);
        savedPosition = clamped;
        setPosition(clamped);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clampPosition]);

  // Document-level pointer tracking for drag
  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - startPointerRef.current.x;
      const dy = e.clientY - startPointerRef.current.y;
      updatePosition(
        clampPosition(
          startPositionRef.current.x + dx,
          startPositionRef.current.y + dy,
        ),
      );
    };
    const onPointerUp = () => {
      isDraggingRef.current = false;
    };
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };
  }, [clampPosition, updatePosition]);

  // Escape closes panel (not while editing title)
  useGlobalListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape" && isVisible && !isEditingTitle) {
      useFocusStore.getState().resetFocus();
    }
  });

  const handleDragBarPointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    startPointerRef.current = { x: e.clientX, y: e.clientY };
    startPositionRef.current = position;
  };

  return (
    <AnimatePresence>
      {isVisible && cardId && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.97 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="hidden sm:block fixed z-50 w-72"
          style={{ left: position.x, top: position.y }}
        >
          <div className="rounded-xl ring-1 ring-task-panel-ring bg-task-panel overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.75)]">
            {/* Drag bar */}
            <div
              className={cn(
                "flex items-center gap-2 px-3 py-2 cursor-grab active:cursor-grabbing select-none",
                !isCollapsed && "border-b border-task-panel-divider",
              )}
              onPointerDown={handleDragBarPointerDown}
            >
              <GripHorizontal className="h-3.5 w-3.5 text-content-tinted shrink-0" />
              <span className="text-content-tinted text-xs font-medium flex-1">
                Card Details
              </span>
              <button
                className="cursor-pointer text-content-tinted hover:text-content transition-colors shrink-0"
                onClick={() => setIsCollapsed((c) => !c)}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {isCollapsed ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronUp className="h-3.5 w-3.5" />
                )}
              </button>
            </div>

            {!isCollapsed && (
              <CardDetailsBody
                cardId={cardId}
                isEditingTitle={isEditingTitle}
                setIsEditingTitle={setIsEditingTitle}
              />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Body dispatcher ──────────────────────────────────────────────────────────

function CardDetailsBody({
  cardId: cardId,
  isEditingTitle,
  setIsEditingTitle,
}: {
  cardId: string;
  isEditingTitle: boolean;
  setIsEditingTitle: (v: boolean) => void;
}) {
  const card = useSyncSelector(
    () => projectCategoryCardsSlice.byId(cardId),
    [cardId],
  );

  if (isTask(card)) {
    return (
      <TaskBody
        task={card}
        isEditingTitle={isEditingTitle}
        setIsEditingTitle={setIsEditingTitle}
      />
    );
  }

  if (isTaskTemplate(card)) {
    return (
      <TemplateBody
        template={card}
        isEditingTitle={isEditingTitle}
        setIsEditingTitle={setIsEditingTitle}
      />
    );
  }

  return null;
}

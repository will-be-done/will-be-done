import { useEffect, useRef, useState, useCallback } from "react";
import {
  ChevronDown,
  ChevronUp,
  GripHorizontal,
  Calendar,
  Folder,
  Hash,
  CalendarDays,
  Clock,
  RefreshCw,
  Pencil,
  X as XIcon,
  FileOutput,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useDispatch, useSyncSelector } from "@will-be-done/hyperdb";
import {
  buildFocusKey,
  focusSlice,
  parseColumnKey,
} from "@/store/focusSlice.ts";
import {
  projectCategoryCardsSlice,
  projectCategoriesSlice,
  dailyListsProjectionsSlice,
  cardsTasksSlice,
  cardsTaskTemplatesSlice,
  cardsSlice,
  type Task,
  type TaskTemplate,
  isTask,
  isTaskTemplate,
} from "@will-be-done/slices/space";
import { useGlobalListener } from "@/components/GlobalListener/hooks.tsx";
import { CheckboxComp } from "@/components/Task/Task.tsx";
import { MoveModal } from "@/components/MoveTaskModel/MoveModel.tsx";
import { RepeatModal } from "@/components/RepeatModal/RepeatModal.tsx";
import { TaskDatePicker } from "@/components/Task/TaskDatePicker.tsx";
import TextareaAutosize from "react-textarea-autosize";
import { AnimatePresence, motion } from "motion/react";

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

export function TaskDetails() {
  const dispatch = useDispatch();

  // Use getFocusKey (not isSomethingFocused) so panel stays visible while
  // MoveModal has focus disabled.
  const focusKey = useSyncSelector(() => focusSlice.getFocusKey(), []);
  const parsed = focusKey ? parseColumnKey(focusKey) : null;
  const isCardFocused =
    parsed?.type === "task" ||
    parsed?.type === "projection" ||
    parsed?.type === "template";
  const cardId = isCardFocused ? parsed.id : null;
  const isVisible = !!cardId;
  const exists = useSyncSelector(
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
      dispatch(focusSlice.resetFocus());
    }
  });

  const handleDragBarPointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    startPointerRef.current = { x: e.clientX, y: e.clientY };
    startPositionRef.current = position;
  };

  if (!exists) return null;

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
                Task Details
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
              <TaskDetailsBody
                taskId={cardId}
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

// ─── Body ─────────────────────────────────────────────────────────────────────

function TaskDetailsBody({
  taskId,
  isEditingTitle,
  setIsEditingTitle,
}: {
  taskId: string;
  isEditingTitle: boolean;
  setIsEditingTitle: (v: boolean) => void;
}) {
  const card = useSyncSelector(
    () => projectCategoryCardsSlice.byId(taskId),
    [taskId],
  );

  if (isTask(card)) {
    return (
      <TaskBody
        card={card}
        isEditingTitle={isEditingTitle}
        setIsEditingTitle={setIsEditingTitle}
      />
    );
  }

  if (isTaskTemplate(card)) {
    return (
      <TemplateBody
        card={card}
        isEditingTitle={isEditingTitle}
        setIsEditingTitle={setIsEditingTitle}
      />
    );
  }

  return null;
}

// ─── Shared title editing ─────────────────────────────────────────────────────

function useTitleEditing({
  title,
  setIsEditingTitle,
  onSave,
}: {
  title: string;
  setIsEditingTitle: (v: boolean) => void;
  onSave: (trimmed: string) => void;
}) {
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const editingTitle = titleDraft ?? title;

  const saveTitle = useCallback(() => {
    if (titleDraft !== null) {
      const trimmed = titleDraft.trim();
      if (trimmed && trimmed !== title) {
        onSave(trimmed);
      }
      setTitleDraft(null);
    }
    setIsEditingTitle(false);
  }, [title, titleDraft, setIsEditingTitle, onSave]);

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      saveTitle();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setTitleDraft(null);
      setIsEditingTitle(false);
    }
  };

  const textareaRef = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.focus();
    el.selectionStart = el.value.length;
  }, []);

  return {
    editingTitle,
    setTitleDraft,
    saveTitle,
    handleTitleKeyDown,
    textareaRef,
  };
}

// ─── Task body ────────────────────────────────────────────────────────────────

function TaskBody({
  card,
  isEditingTitle,
  setIsEditingTitle,
}: {
  card: Task;
  isEditingTitle: boolean;
  setIsEditingTitle: (v: boolean) => void;
}) {
  const dispatch = useDispatch();
  const taskId = card.id;

  const project = useSyncSelector(
    () =>
      projectCategoriesSlice.projectOfCategoryOrDefault(card.projectCategoryId),
    [card.projectCategoryId],
  );
  const projectCategories = useSyncSelector(
    () => projectCategoriesSlice.byProjectId(project.id),
    [project.id],
  );
  const scheduleDate = useSyncSelector(
    () => dailyListsProjectionsSlice.getDateOfTask(taskId),
    [taskId],
  );

  const taskTemplateId = card.templateId ?? null;
  const template = useSyncSelector(
    () => cardsTaskTemplatesSlice.byId(taskTemplateId ?? ""),
    [taskTemplateId],
  );
  const ruleText = useSyncSelector(
    () => cardsTaskTemplatesSlice.ruleText(taskTemplateId ?? ""),
    [taskTemplateId],
  );

  const [isMoveProjectModalOpen, setIsMoveProjectModalOpen] = useState(false);
  const [isRepeatModalOpen, setIsRepeatModalOpen] = useState(false);

  const {
    editingTitle,
    setTitleDraft,
    saveTitle,
    handleTitleKeyDown,
    textareaRef,
  } = useTitleEditing({
    title: card.title,
    setIsEditingTitle,
    onSave: useCallback(
      (trimmed: string) =>
        dispatch(cardsTasksSlice.updateTask(taskId, { title: trimmed })),
      [dispatch, taskId],
    ),
  });

  const handleRemoveRepeat = useCallback(() => {
    if (!card.templateId) return;
    if (
      window.confirm(
        "Remove repeat template? This will unlink all generated tasks.",
      )
    ) {
      dispatch(cardsTaskTemplatesSlice.deleteTemplates([card.templateId]));
    }
  }, [card.templateId, dispatch]);

  const handleRepeatConfirm = useCallback(
    (ruleString: string) => {
      setIsRepeatModalOpen(false);
      if (card.templateId) {
        dispatch(
          cardsTaskTemplatesSlice.updateTemplate(card.templateId, {
            repeatRule: ruleString,
          }),
        );
      } else {
        const template = dispatch(
          cardsTaskTemplatesSlice.createFromTask(card, {
            repeatRule: ruleString,
          }),
        );

        console.log("template created", template);

        dispatch(
          focusSlice.focusByKey(buildFocusKey(template.id, template.type)),
        );
      }
    },
    [card, dispatch],
  );

  return (
    <div className="px-3 py-3 space-y-3">
      {/* Title row: checkbox + title */}
      <div className="flex items-start gap-2">
        <div className="shrink-0">
          <CheckboxComp
            checked={card.state === "done"}
            onChange={() => dispatch(cardsTasksSlice.toggleState(taskId))}
          />
        </div>

        {isEditingTitle ? (
          <TextareaAutosize
            ref={textareaRef}
            value={editingTitle}
            onChange={(e) => setTitleDraft(e.target.value)}
            onKeyDown={handleTitleKeyDown}
            onBlur={saveTitle}
            className="flex-1 bg-transparent resize-none focus:outline-none text-sm font-medium text-content leading-snug"
          />
        ) : (
          <div
            className={cn(
              "flex-1 text-sm font-medium leading-snug cursor-text select-none",
              card.state === "done"
                ? "line-through text-content-tinted"
                : "text-content",
            )}
            onDoubleClick={() => setIsEditingTitle(true)}
            title="Double-click to edit"
          >
            {card.title || (
              <span className="italic text-content-tinted">Untitled</span>
            )}
          </div>
        )}
      </div>

      {/* Detail rows */}
      <div className="space-y-2 text-xs">
        <DetailRow
          icon={<Folder className="h-3 w-3 shrink-0" />}
          label="Project"
        >
          <button
            className="cursor-pointer rounded px-1 -mx-1 hover:bg-task-panel-hover transition-colors text-left"
            onClick={() => setIsMoveProjectModalOpen(true)}
          >
            {project.icon || "🟡"} {project.title}
          </button>
        </DetailRow>

        <DetailRow
          icon={<Hash className="h-3 w-3 shrink-0" />}
          label="Category"
        >
          <select
            value={card.projectCategoryId}
            onChange={(e) =>
              dispatch(
                cardsTasksSlice.updateTask(taskId, {
                  projectCategoryId: e.target.value,
                }),
              )
            }
            className="bg-transparent text-content text-xs focus:outline-none cursor-pointer rounded px-1 -mx-1 hover:bg-task-panel-hover transition-colors"
          >
            {projectCategories.map((cat) => (
              <option
                key={cat.id}
                value={cat.id}
                className="bg-panel text-content"
              >
                {cat.title}
              </option>
            ))}
          </select>
        </DetailRow>

        <DetailRow
          icon={<Calendar className="h-3 w-3 shrink-0" />}
          label="Scheduled"
        >
          <TaskDatePicker
            taskId={taskId}
            currentDate={scheduleDate}
            trigger={
              <button className="cursor-pointer rounded px-1 -mx-1 hover:bg-task-panel-hover transition-colors text-left">
                {scheduleDate ? (
                  format(scheduleDate, "MMM d, yyyy")
                ) : (
                  <span className="italic">No date</span>
                )}
              </button>
            }
          />
        </DetailRow>

        <DetailRow
          icon={<CalendarDays className="h-3 w-3 shrink-0" />}
          label="Created"
        >
          {format(new Date(card.createdAt), "MMM d, yyyy, h:mm a")}
        </DetailRow>

        {!!card.lastToggledAt && (
          <DetailRow
            icon={<Clock className="h-3 w-3 shrink-0" />}
            label="Last toggled"
          >
            {format(new Date(card.lastToggledAt), "MMM d, yyyy, h:mm a")}
          </DetailRow>
        )}

        <DetailRow
          icon={<RefreshCw className="h-3 w-3 shrink-0" />}
          label="Repeat"
        >
          {taskTemplateId ? (
            <span className="flex items-center gap-1">
              <span className="italic">{ruleText || "custom"}</span>
              <button
                onClick={() => setIsRepeatModalOpen(true)}
                title="Edit repeat"
                className="cursor-pointer text-content-tinted hover:text-content transition-colors"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                onClick={handleRemoveRepeat}
                title="Remove repeat"
                className="cursor-pointer text-content-tinted hover:text-content transition-colors"
              >
                <XIcon className="h-3 w-3" />
              </button>
            </span>
          ) : (
            <button
              className="cursor-pointer rounded px-1 -mx-1 hover:bg-task-panel-hover transition-colors italic text-content-tinted"
              onClick={() => setIsRepeatModalOpen(true)}
            >
              Make repeating
            </button>
          )}
        </DetailRow>
      </div>

      {isMoveProjectModalOpen && (
        <MoveModal
          setIsOpen={setIsMoveProjectModalOpen}
          handleMove={(projectId) => {
            dispatch(cardsTasksSlice.moveToProject(taskId, projectId));
            setIsMoveProjectModalOpen(false);
          }}
          exceptProjectId={project.id}
        />
      )}

      {isRepeatModalOpen && (
        <RepeatModal
          initialRule={template?.repeatRule}
          onConfirm={handleRepeatConfirm}
          onCancel={() => setIsRepeatModalOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Template body ────────────────────────────────────────────────────────────

function TemplateBody({
  card,
  isEditingTitle,
  setIsEditingTitle,
}: {
  card: TaskTemplate;
  isEditingTitle: boolean;
  setIsEditingTitle: (v: boolean) => void;
}) {
  const dispatch = useDispatch();
  const templateId = card.id;

  const project = useSyncSelector(
    () =>
      projectCategoriesSlice.projectOfCategoryOrDefault(card.projectCategoryId),
    [card.projectCategoryId],
  );
  const projectCategories = useSyncSelector(
    () => projectCategoriesSlice.byProjectId(project.id),
    [project.id],
  );

  const ruleText = useSyncSelector(
    () => cardsTaskTemplatesSlice.ruleText(templateId),
    [templateId],
  );

  const [isMoveProjectModalOpen, setIsMoveProjectModalOpen] = useState(false);
  const [isRepeatModalOpen, setIsRepeatModalOpen] = useState(false);

  const {
    editingTitle,
    setTitleDraft,
    saveTitle,
    handleTitleKeyDown,
    textareaRef,
  } = useTitleEditing({
    title: card.title,
    setIsEditingTitle,
    onSave: useCallback(
      (trimmed: string) =>
        dispatch(
          cardsTaskTemplatesSlice.updateTemplate(templateId, { title: trimmed }),
        ),
      [dispatch, templateId],
    ),
  });

  const handleConvertToTask = useCallback(() => {
    const task = dispatch(cardsTasksSlice.createFromTemplate(card));

    dispatch(focusSlice.focusByKey(buildFocusKey(task.id, task.type)));
  }, [card, dispatch]);

  const handleRepeatConfirm = useCallback(
    (ruleString: string) => {
      setIsRepeatModalOpen(false);

      dispatch(
        cardsTaskTemplatesSlice.updateTemplate(templateId, {
          repeatRule: ruleString,
        }),
      );
    },
    [dispatch, templateId],
  );

  return (
    <div className="px-3 py-3 space-y-3">
      {/* Title row */}
      <div className="flex items-start gap-2">
        <RefreshCw
          className="h-4 w-4 text-accent shrink-0 mt-0.5"
          strokeWidth={2.5}
        />

        {isEditingTitle ? (
          <TextareaAutosize
            ref={textareaRef}
            value={editingTitle}
            onChange={(e) => setTitleDraft(e.target.value)}
            onKeyDown={handleTitleKeyDown}
            onBlur={saveTitle}
            className="flex-1 bg-transparent resize-none focus:outline-none text-sm font-medium text-content leading-snug"
          />
        ) : (
          <div
            className="flex-1 text-sm font-medium leading-snug cursor-text select-none text-content"
            onDoubleClick={() => setIsEditingTitle(true)}
            title="Double-click to edit"
          >
            {card.title || (
              <span className="italic text-content-tinted">Untitled</span>
            )}
          </div>
        )}
      </div>

      {/* Detail rows */}
      <div className="space-y-2 text-xs">
        <DetailRow
          icon={<Folder className="h-3 w-3 shrink-0" />}
          label="Project"
        >
          <button
            className="cursor-pointer rounded px-1 -mx-1 hover:bg-task-panel-hover transition-colors text-left"
            onClick={() => setIsMoveProjectModalOpen(true)}
          >
            {project.icon || "🟡"} {project.title}
          </button>
        </DetailRow>

        <DetailRow
          icon={<Hash className="h-3 w-3 shrink-0" />}
          label="Category"
        >
          <select
            value={card.projectCategoryId}
            onChange={(e) =>
              dispatch(
                cardsTaskTemplatesSlice.updateTemplate(templateId, {
                  projectCategoryId: e.target.value,
                }),
              )
            }
            className="bg-transparent text-content text-xs focus:outline-none cursor-pointer rounded px-1 -mx-1 hover:bg-task-panel-hover transition-colors"
          >
            {projectCategories.map((cat) => (
              <option
                key={cat.id}
                value={cat.id}
                className="bg-panel text-content"
              >
                {cat.title}
              </option>
            ))}
          </select>
        </DetailRow>

        <DetailRow
          icon={<RefreshCw className="h-3 w-3 shrink-0" />}
          label="Repeat"
        >
          <button
            className="cursor-pointer rounded px-1 -mx-1 hover:bg-task-panel-hover transition-colors text-left italic"
            onClick={() => setIsRepeatModalOpen(true)}
          >
            {ruleText || "custom"}
          </button>
        </DetailRow>

        <DetailRow
          icon={<CalendarDays className="h-3 w-3 shrink-0" />}
          label="Created"
        >
          {format(new Date(card.createdAt), "MMM d, yyyy, h:mm a")}
        </DetailRow>
      </div>

      {/* Convert to task button */}
      <button
        onClick={handleConvertToTask}
        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium text-content-tinted border border-border hover:bg-task-panel-hover hover:text-content transition-colors cursor-pointer"
      >
        <FileOutput className="h-3 w-3" />
        Convert to task
      </button>

      {isMoveProjectModalOpen && (
        <MoveModal
          setIsOpen={setIsMoveProjectModalOpen}
          handleMove={(projectId) => {
            dispatch(
              cardsTaskTemplatesSlice.moveTemplateToProject(
                templateId,
                projectId,
              ),
            );
            setIsMoveProjectModalOpen(false);
          }}
          exceptProjectId={project.id}
        />
      )}

      {isRepeatModalOpen && (
        <RepeatModal
          initialRule={card.repeatRule}
          onConfirm={handleRepeatConfirm}
          onCancel={() => setIsRepeatModalOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Shared row ───────────────────────────────────────────────────────────────

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-content-tinted mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0 flex">
        <span className="text-content-tinted mr-1">{label}: </span>
        <span className="text-content">{children}</span>
      </div>
    </div>
  );
}

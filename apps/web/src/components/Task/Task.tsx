import { CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import invariant from "tiny-invariant";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import { preserveOffsetOnSource } from "@atlaskit/pragmatic-drag-and-drop/element/preserve-offset-on-source";
import { dropTargetForExternal } from "@atlaskit/pragmatic-drag-and-drop/external/adapter";
import {
  attachClosestEdge,
  type Edge,
  extractClosestEdge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import ReactDOM from "react-dom";
import { DndModelData, isModelDNDData } from "@/lib/dnd/models";
import TextareaAutosize from "react-textarea-autosize";
import { usePrevious, useUnmount } from "../../utils";
import { MoveModal } from "@/components/MoveTaskModel/MoveModel";
import { useGlobalListener } from "@/components/GlobalListener/hooks.tsx";
import { isInputElement } from "../../utils/isInputElement";
import {
  getDOMSiblings,
  getDOMAdjacentColumns,
  getDOMAdjacentStackedPlaceholder,
} from "@/components/Focus/domNavigation.ts";
import clsx from "clsx";
import { RotateCw, CircleDashed } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  appSlice,
  cardsSlice,
  projectCategoriesSlice,
  cardsTasksSlice,
  dailyListsProjectionsSlice,
  AnyModelType,
  type Task,
  type TaskTemplate,
  type CardWrapperType,
  type CardWrapper,
  type Project,
  type ProjectCategory,
  isTask,
  isTaskTemplate,
} from "@will-be-done/slices/space";
import { useAsyncDispatch, useSelect, useAsyncSelector } from "@will-be-done/hyperdb";
import {
  buildFocusKey,
  useFocusStore,
  parseColumnKey,
} from "@/store/focusSlice.ts";
import { Checkbox } from "@base-ui-components/react/checkbox";
import { projectCategoryCardsSlice } from "@will-be-done/slices/space";
import { useCurrentDate } from "../DaysBoard/hooks";
import { format, startOfDay } from "date-fns";
import { TaskDatePicker } from "./TaskDatePicker";

export function CheckboxComp({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Checkbox.Root
      defaultChecked
      className="flex size-4 items-center justify-center rounded-sm bg-input-bg ring-1 ring-ring mt-0.5 transition-all hover:ring-ring-hover data-[checked]:bg-input-checked data-[checked]:ring-input-checked"
      tabIndex={-1}
      checked={checked}
      onCheckedChange={onChange}
    >
      <Checkbox.Indicator className="flex text-white data-[unchecked]:hidden">
        <CheckIcon className="size-2.5" />
      </Checkbox.Indicator>
    </Checkbox.Root>
  );
}

function CheckIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg
      fill="currentcolor"
      width="10"
      height="10"
      viewBox="0 0 10 10"
      {...props}
    >
      <path d="M9.1603 1.12218C9.50684 1.34873 9.60427 1.81354 9.37792 2.16038L5.13603 8.66012C5.01614 8.8438 4.82192 8.96576 4.60451 8.99384C4.3871 9.02194 4.1683 8.95335 4.00574 8.80615L1.24664 6.30769C0.939709 6.02975 0.916013 5.55541 1.19372 5.24822C1.47142 4.94102 1.94536 4.91731 2.2523 5.19524L4.36085 7.10461L8.12299 1.33999C8.34934 0.993152 8.81376 0.895638 9.1603 1.12218Z" />
    </svg>
  );
}

type State =
  | { type: "idle" }
  | { type: "preview"; container: HTMLElement; rect: DOMRect }
  | { type: "dragging" };

const idleState: State = { type: "idle" };
const draggingState: State = { type: "dragging" };

const TaskPrimitive = ({
  title,
  style,
}: {
  title: string;
  style: CSSProperties;
}) => {
  return (
    <div
      className="p-3 rounded-lg bg-panel ring-1 ring-ring shadow-lg"
      style={style}
    >
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-end">
          <div className="h-4 w-4 rounded-sm bg-input-bg ring-1 ring-ring" />
        </div>
        <div className="font-medium text-content h-6">{title}</div>
      </div>
    </div>
  );
};

export const DropTaskIndicator = ({
  direction,
}: {
  direction: "top" | "bottom";
}) => {
  return (
    <div
      className={clsx(
        "absolute left-0 right-0 bottom-0 w-full bg-accent h-[2px] rounded-full",
        direction == "top" && "top-[-9px]",
        direction == "bottom" && "bottom-[-9px]",
      )}
    ></div>
  );
};

// TODO: rename to project item
// TODO: think about to remove taskBox
export const TaskComp = ({
  taskId,
  cardWrapperId,
  cardWrapperType,
  displayedUnderProjectId,
  alwaysShowProject,
  newTaskParams,
  displayLastScheduleTime,
  centerScheduleDate,
}: {
  taskId: string;
  cardWrapperId: string;
  cardWrapperType: CardWrapperType;
  displayedUnderProjectId?: string;
  alwaysShowProject?: boolean;
  newTaskParams?: Partial<Task>;
  displayLastScheduleTime?: boolean;
  centerScheduleDate?: boolean;
}) => {
  const dispatch = useAsyncDispatch();

  // TODO: remove card wrapper
  const cardResult = useAsyncSelector(
    () => projectCategoryCardsSlice.byIdOrDefault(taskId),
    [taskId],
  );
  const categoryId = cardResult.data?.projectCategoryId ?? "";
  const categoryResult = useAsyncSelector(
    () => projectCategoriesSlice.byIdOrDefault(categoryId),
    [categoryId],
  );
  const cardWrapperResult = useAsyncSelector(
    () => cardsSlice.cardWrapperIdOrDefault(cardWrapperId, cardWrapperType),
    [cardWrapperId, cardWrapperType],
  );
  const projectResult = useAsyncSelector(
    () =>
      projectCategoriesSlice.projectOfCategoryOrDefault(categoryId),
    [categoryId],
  );
  const lastScheduleTimeResult = useAsyncSelector(
    () => dailyListsProjectionsSlice.getDateOfTask(taskId),
    [taskId],
  );

  if (cardResult.isPending || categoryResult.isPending || cardWrapperResult.isPending || projectResult.isPending || lastScheduleTimeResult.isPending) return null;

  return (
    <TaskCompInner
      taskId={taskId}
      cardWrapperId={cardWrapperId}
      cardWrapperType={cardWrapperType}
      displayedUnderProjectId={displayedUnderProjectId}
      alwaysShowProject={alwaysShowProject}
      newTaskParams={newTaskParams}
      displayLastScheduleTime={displayLastScheduleTime}
      centerScheduleDate={centerScheduleDate}
      card={cardResult.data!}
      category={categoryResult.data!}
      cardWrapper={cardWrapperResult.data!}
      project={projectResult.data!}
      lastScheduleTime={lastScheduleTimeResult.data!}
      dispatch={dispatch}
    />
  );
};

const TaskCompInner = ({
  taskId,
  displayedUnderProjectId,
  alwaysShowProject,
  newTaskParams,
  displayLastScheduleTime,
  centerScheduleDate,
  card,
  category,
  cardWrapper,
  project,
  lastScheduleTime,
  dispatch,
}: {
  taskId: string;
  cardWrapperId: string;
  cardWrapperType: CardWrapperType;
  displayedUnderProjectId?: string;
  alwaysShowProject?: boolean;
  newTaskParams?: Partial<Task>;
  displayLastScheduleTime?: boolean;
  centerScheduleDate?: boolean;
  card: Task | TaskTemplate;
  category: ProjectCategory;
  cardWrapper: CardWrapper;
  project: Project;
  lastScheduleTime: Date | undefined;
  dispatch: <TReturn>(action: Generator<unknown, TReturn, unknown>) => Promise<TReturn>;
}) => {
  const date = useCurrentDate();

  const [editingTitle, setEditingTitle] = useState<string>(card.title ?? "");
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);
  const [dndState, setDndState] = useState<State>(idleState);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);

  const focusableItemKey = buildFocusKey(cardWrapper.id, cardWrapper.type);

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === "Enter" && !e.shiftKey) || e.key === "Escape") {
      e.preventDefault();

      useFocusStore.getState().resetEdit();
    }
  };

  const isFocused = useFocusStore(
    (s) => !s.isFocusDisabled && s.focusItemKey === focusableItemKey,
  );
  const isEditing = useFocusStore(
    (s) => !s.isFocusDisabled && s.editItemKey === focusableItemKey,
  );
  const select = useSelect();

  const handleTick = useCallback(() => {
    if (!isTask(card)) return;

    const [upKey, downKey] = getDOMSiblings(focusableItemKey);

    const taskState = card.state;
    void dispatch(cardsTasksSlice.toggleState(taskId));

    if (!isFocused) return;

    const upModel = upKey
      ? select(
          appSlice.byId(parseColumnKey(upKey).id, parseColumnKey(upKey).type),
        )
      : undefined;
    const downModel = downKey
      ? select(
          appSlice.byId(
            parseColumnKey(downKey).id,
            parseColumnKey(downKey).type,
          ),
        )
      : undefined;

    const upTask = upModel && select(cardsSlice.taskOfModel(upModel));
    const downTask = downModel && select(cardsSlice.taskOfModel(downModel));

    if (downTask && downTask.state === taskState) {
      useFocusStore.getState().focusByKey(downKey!);
    } else if (upTask && upTask.state === taskState) {
      useFocusStore.getState().focusByKey(upKey!);
    }
  }, [dispatch, focusableItemKey, isFocused, card, select, taskId]);

  useGlobalListener("keydown", (e: KeyboardEvent) => {
    const focusState = useFocusStore.getState();
    const isSomethingEditing =
      !focusState.isFocusDisabled && !!focusState.editItemKey;
    const isFocusDisabled = focusState.isFocusDisabled;

    if (isSomethingEditing) return;
    if (!isFocused) return;
    if (isFocusDisabled || e.defaultPrevented) return;

    const target =
      e.target instanceof Element ? e.target : document.activeElement;
    if (target && isInputElement(target)) return;

    const noModifiers = !(e.shiftKey || e.ctrlKey || e.metaKey);

    const isAddAfter = noModifiers && (e.code === "KeyA" || e.code === "KeyO");
    const isAddBefore = e.shiftKey && (e.code === "KeyA" || e.code === "KeyO");

    const isMoveUp = e.ctrlKey && (e.code === "ArrowUp" || e.code == "KeyK");
    const isMoveDown =
      e.ctrlKey && (e.code === "ArrowDown" || e.code == "KeyJ");
    const isMoveLeft =
      e.ctrlKey && (e.code === "ArrowLeft" || e.code == "KeyH");
    const isMoveRight =
      e.ctrlKey && (e.code === "ArrowRight" || e.code == "KeyL");

    if (e.code === "Space" && noModifiers) {
      e.preventDefault();

      handleTick();
    } else if (e.code === "KeyM" && noModifiers) {
      e.preventDefault();

      // NOTE: this is needed to restore Focus back correctly after modal close
      ref.current?.focus();
      setIsMoveModalOpen(true);
    } else if (isMoveLeft || isMoveRight) {
      e.preventDefault();

      const [leftColumnModel, rightColumnModel] =
        getDOMAdjacentColumns(focusableItemKey);

      const targetColumnModel = isMoveLeft ? leftColumnModel : rightColumnModel;
      if (targetColumnModel) {
        void dispatch(
          appSlice.handleDrop(
            targetColumnModel.id,
            targetColumnModel.type as AnyModelType,
            cardWrapper.id,
            cardWrapper.type,
            "top",
          ),
        );

        setTimeout(() => {
          const el = document.querySelector<HTMLElement>(
            `[data-focusable-key="${focusableItemKey}"]`,
          );
          if (el) {
            el.focus();
            el.scrollIntoView({
              behavior: "smooth",
              block: "center",
              inline: "center",
            });
          }
        }, 0);
      }
    } else if (isMoveUp || isMoveDown) {
      e.preventDefault();

      const [upKey, downKey] = getDOMSiblings(focusableItemKey, {
        forMove: true,
      });

      let targetKey = isMoveUp ? upKey : downKey;
      let crossedBoundary = false;

      if (targetKey) {
        const currentColumn = document
          .querySelector(`[data-focusable-key="${focusableItemKey}"]`)
          ?.closest("[data-focus-column]");
        const targetColumn = document
          .querySelector(`[data-focusable-key="${targetKey}"]`)
          ?.closest("[data-focus-column]");
        crossedBoundary = currentColumn !== targetColumn;
      } else {
        // No valid sibling — fall back to adjacent section's placeholder
        targetKey = getDOMAdjacentStackedPlaceholder(
          focusableItemKey,
          isMoveUp ? "up" : "down",
        );
        crossedBoundary = targetKey !== null;
      }

      if (targetKey) {
        const { id, type } = parseColumnKey(targetKey);

        const edge: Edge = crossedBoundary
          ? isMoveUp
            ? "bottom"
            : "top"
          : isMoveUp
            ? "top"
            : "bottom";

        void dispatch(
          appSlice.handleDrop(id, type, cardWrapper.id, cardWrapper.type, edge),
        );

        setTimeout(() => {
          const el = document.querySelector<HTMLElement>(
            `[data-focusable-key="${focusableItemKey}"]`,
          );
          if (el) {
            el.focus();
            el.scrollIntoView({
              behavior: "smooth",
              block: "center",
              inline: "center",
            });
          }
        }, 0);
      }

      return;
    } else if (
      (e.code === "Backspace" || e.code === "KeyD" || e.code === "KeyX") &&
      noModifiers
    ) {
      e.preventDefault();

      const [upKey, downKey] = getDOMSiblings(focusableItemKey);

      void dispatch(appSlice.deleteModel(cardWrapper.id, cardWrapper.type));

      if (downKey) {
        useFocusStore.getState().focusByKey(downKey);
      } else if (upKey) {
        useFocusStore.getState().focusByKey(upKey);
      } else {
        useFocusStore.getState().resetFocus();
      }
    } else if ((e.code === "Enter" || e.code === "KeyI") && noModifiers) {
      e.preventDefault();

      useFocusStore.getState().editByKey(focusableItemKey);
    } else if (isAddAfter || isAddBefore) {
      if (isTask(card) && card.state === "done") return;

      e.preventDefault();

      void dispatch(
        cardsSlice.createSiblingCard(
          cardWrapper,
          isAddAfter ? "after" : "before",
          newTaskParams,
        ),
      ).then((newBox) => {
        useFocusStore
          .getState()
          .editByKey(buildFocusKey(newBox.id, newBox.type));
      });

      return;
    }
  });

  const handleMove = (projectId: string) => {
    setIsMoveModalOpen(false);
    void dispatch(cardsTasksSlice.moveToProject(taskId, projectId));
  };

  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    invariant(element);

    if (isEditing) return;

    return combine(
      draggable({
        element: element,
        getInitialData: (): DndModelData => ({
          modelId: cardWrapper.id,
          modelType: cardWrapper.type,
        }),
        onGenerateDragPreview: ({ location, source, nativeSetDragImage }) => {
          const rect = source.element.getBoundingClientRect();

          setCustomNativeDragPreview({
            nativeSetDragImage,
            getOffset: preserveOffsetOnSource({
              element,
              input: location.current.input,
            }),
            render({ container }) {
              setDndState({ type: "preview", container, rect });

              return () => {
                setDndState(draggingState);
              };
            },
          });
        },

        onDragStart: () => setDndState(draggingState),
        onDrop: () => setDndState(idleState),
      }),
      dropTargetForExternal({
        element: element,
      }),
      dropTargetForElements({
        element: element,
        canDrop: (inp) => {
          const { source } = inp;

          const data = source.data;
          if (!isModelDNDData(data)) return false;

          return select(
            appSlice.canDrop(
              cardWrapper.id,
              cardWrapper.type,
              data.modelId,
              data.modelType,
            ),
          );
        },
        getIsSticky: () => true,
        getData: ({ input, element }) => {
          const data: DndModelData = {
            modelId: cardWrapper.id,
            modelType: cardWrapper.type,
          };

          return attachClosestEdge(data, {
            input,
            element,
            allowedEdges: ["top", "bottom"],
          });
        },
        onDragEnter: (args) => {
          const data = args.source.data;
          if (isModelDNDData(data)) {
            setClosestEdge(extractClosestEdge(args.self.data));
          }
        },
        onDrag: (args) => {
          const data = args.source.data;

          if (isModelDNDData(data)) {
            setClosestEdge(extractClosestEdge(args.self.data));
          }
        },
        onDragLeave: () => {
          setClosestEdge(null);
        },
        onDrop: () => {
          setClosestEdge(null);
        },
      }),
    );
  }, [dispatch, isEditing, select, cardWrapper.id, cardWrapper.type]);

  const handleRef = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.focus();

    el.selectionStart = el.value.length;
  }, []);

  const prevIsEditing = usePrevious(isEditing);
  const taskTitle = card.title ?? "";
  useEffect(() => {
    setEditingTitle(taskTitle);
  }, [taskTitle]);

  useEffect(() => {
    if (!isEditing && prevIsEditing && editingTitle !== taskTitle) {
      void dispatch(
        cardsTasksSlice.updateTask(taskId, {
          title: editingTitle,
        }),
      );
    }
  }, [dispatch, editingTitle, isEditing, prevIsEditing, taskId, taskTitle]);

  useUnmount(() => {
    if (editingTitle !== taskTitle) {
      void dispatch(
        cardsTasksSlice.updateTask(taskId, {
          title: editingTitle,
        }),
      );
    }
  });

  const shouldHighlightTime =
    lastScheduleTime &&
    startOfDay(date) > lastScheduleTime &&
    isTask(card) &&
    card.state === "todo";

  return (
    <div className="relative">
      {closestEdge == "top" && <DropTaskIndicator direction="top" />}
      <div
        data-focusable-key={focusableItemKey}
        data-ignore-drop={
          isTask(card) && card.state === "done" ? true : undefined
        }
        data-order-token={card.orderToken}
        tabIndex={0}
        className={clsx(
          `relative rounded-lg whitespace-break-spaces [overflow-wrap:anywhere] text-sm ring-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent`,
          isFocused
            ? isTask(card) && card.state === "done"
              ? "ring-2 ring-done-panel-selected text-done-content"
              : "ring-2 ring-accent text-content"
            : isTask(card) && card.state === "done"
              ? "ring-done-ring text-done-content hover:ring-ring-hover"
              : "ring-ring text-content hover:ring-ring-hover",
        )}
        style={{}}
        onClick={() =>
          useFocusStore.getState().focusByKey(focusableItemKey, true)
        }
        onDoubleClick={() => {
          useFocusStore.getState().editByKey(focusableItemKey);
        }}
        ref={ref}
      >
        {/* {!isSelfDragging && ( */}
        <>
          <div className="absolute top-2 right-2 flex gap-1">
            {isTaskTemplate(card) && <CircleDashed className="h-3 w-3" />}
            {isTask(card) && card.templateId && (
              <RotateCw className="h-3 w-3" />
            )}
          </div>
          <div
            className={clsx(
              "flex items-start gap-1.5 px-2 pt-2 font-medium pb-3 rounded-t-lg ",
              isFocused
                ? isTask(card) && card.state === "done"
                  ? "bg-done-panel"
                  : "bg-panel-hover"
                : isTask(card) && card.state === "done"
                  ? "bg-done-panel"
                  : "bg-panel hover:bg-panel-hover",
            )}
          >
            {isEditing ? (
              <>
                {isTask(card) && (
                  <div className="flex items-center justify-end ">
                    <CheckboxComp
                      checked={card.state === "done"}
                      onChange={handleTick}
                    />
                  </div>
                )}
                <TextareaAutosize
                  ref={handleRef}
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onKeyDown={(e) => handleInputKeyDown(e)}
                  className="w-full bg-transparent resize-none focus:outline-none"
                  aria-label="Edit task title"
                />
              </>
            ) : (
              <>
                {isTask(card) && (
                  <div className="flex justify-end">
                    <CheckboxComp
                      checked={card.state === "done"}
                      onChange={handleTick}
                    />
                  </div>
                )}
                <div
                  className={cn("min-h-5", {
                    "line-through": isTask(card) && card.state === "done",
                  })}
                >
                  {card.title}
                </div>
              </>
            )}
          </div>
          <div
            className={cn(
              "text-sm px-2 py-1.5 text-xs rounded-b-lg",
              centerScheduleDate && displayLastScheduleTime
                ? "grid grid-cols-[1fr_auto_1fr] items-center gap-1"
                : "flex items-center justify-between",
              isTask(card) && card.state === "done"
                ? "bg-done-panel-tinted text-done-content"
                : "bg-panel-tinted text-content-tinted",
            )}
          >
            <div>{category.title}</div>

            {displayLastScheduleTime && isTask(card) && (
              <div
                className={cn(
                  centerScheduleDate ? "flex justify-center" : undefined,
                )}
              >
                <TaskDatePicker
                  taskId={taskId}
                  currentDate={lastScheduleTime}
                  trigger={
                    <button
                      className={cn(
                        "flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors cursor-pointer",
                        "hover:bg-black/5 dark:hover:bg-white/5",
                        shouldHighlightTime
                          ? "text-amber-400"
                          : "text-content-tinted hover:text-content",
                      )}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 10 10"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        className="shrink-0"
                      >
                        <rect
                          x="0.5"
                          y="1.5"
                          width="9"
                          height="8"
                          rx="1.5"
                          stroke="currentColor"
                        />
                        <path
                          d="M3 0.5V2.5M7 0.5V2.5"
                          stroke="currentColor"
                          strokeLinecap="round"
                        />
                        <path d="M0.5 4.5H9.5" stroke="currentColor" />
                      </svg>
                      <span>
                        {lastScheduleTime
                          ? format(
                              lastScheduleTime,
                              lastScheduleTime.getFullYear() ===
                                new Date().getFullYear()
                                ? "MMM d"
                                : "MMM d, yyyy",
                            )
                          : "No date"}
                      </span>
                    </button>
                  }
                />
              </div>
            )}

            {(alwaysShowProject || displayedUnderProjectId !== project.id) && (
              <button
                className={cn(
                  "cursor-pointer",
                  centerScheduleDate && displayLastScheduleTime
                    ? "text-right justify-self-end"
                    : "text-right",
                )}
                onClick={() => {
                  setIsMoveModalOpen(true);
                }}
              >
                {project.icon || "🟡"} {project.title}
              </button>
            )}
          </div>
        </>
        {/* )} */}
      </div>
      {closestEdge == "bottom" && <DropTaskIndicator direction="bottom" />}

      {/* {!isSelfDragging && closestEdge == "bottom" && <DropTaskIndicator />} */}

      {dndState.type === "preview" &&
        ReactDOM.createPortal(
          <TaskPrimitive
            title={card.title}
            style={{
              boxSizing: "border-box",
              width: dndState.rect.width,
              height: dndState.rect.height,
            }}
          />,
          dndState.container,
        )}

      {isMoveModalOpen && (
        <MoveModal
          setIsOpen={setIsMoveModalOpen}
          handleMove={handleMove}
          exceptProjectId={project.id}
        />
      )}
    </div>
  );
};

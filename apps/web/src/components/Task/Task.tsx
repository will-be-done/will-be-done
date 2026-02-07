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
import ReactDOM, { unstable_batchedUpdates } from "react-dom";
import { DndModelData, isModelDNDData } from "@/lib/dnd/models";
import TextareaAutosize from "react-textarea-autosize";
import { usePrevious, useUnmount } from "../../utils";
import { MoveModal } from "@/components/MoveTaskModel/MoveModel";
import { useGlobalListener } from "@/components/GlobalListener/hooks.tsx";
import { isInputElement } from "../../utils/isInputElement";
import { useRegisterFocusItem } from "@/components/Focus/useLists.ts";
import clsx from "clsx";
import { RotateCw, CircleDashed } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  appSlice,
  cardsSlice,
  isTask,
  isTaskTemplate,
  projectCategoriesSlice,
  Task,
  cardsTasksSlice,
  dailyListsProjectionsSlice,
  CardWrapperType,
} from "@will-be-done/slices/space";
import { useDispatch, useSelect, useSyncSelector } from "@will-be-done/hyperdb";
import {
  buildFocusKey,
  FocusKey,
  focusManager,
  focusSlice,
  parseColumnKey,
} from "@/store/focusSlice.ts";
import { Checkbox } from "@base-ui-components/react/checkbox";
import { projectCategoryCardsSlice } from "@will-be-done/slices/space";
import { useCurrentDate } from "../DaysBoard/hooks";
import { startOfDay } from "date-fns";
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
  orderNumber,
  newTaskParams,
  displayLastScheduleTime,
}: {
  taskId: string;
  cardWrapperId: string;
  cardWrapperType: CardWrapperType;
  displayedUnderProjectId?: string;
  alwaysShowProject?: boolean;
  orderNumber: string;
  newTaskParams?: Partial<Task>;
  displayLastScheduleTime?: boolean;
}) => {
  const dispatch = useDispatch();

  // TODO: remove card wrapper
  const card = useSyncSelector(
    () => projectCategoryCardsSlice.byIdOrDefault(taskId),
    [taskId],
  );
  const category = useSyncSelector(
    () => projectCategoriesSlice.byIdOrDefault(card.projectCategoryId),
    [card.projectCategoryId],
  );
  const cardWrapper = useSyncSelector(
    () => cardsSlice.cardWrapperIdOrDefault(cardWrapperId, cardWrapperType),
    [cardWrapperId, cardWrapperType],
  );
  const project = useSyncSelector(
    () =>
      projectCategoriesSlice.projectOfCategoryOrDefault(card.projectCategoryId),
    [card.projectCategoryId],
  );
  const lastScheduleTime = useSyncSelector(
    () => dailyListsProjectionsSlice.getDateOfTask(taskId),
    [taskId],
  );
  const date = useCurrentDate();
  const shouldHighlightTime =
    lastScheduleTime &&
    startOfDay(date) > lastScheduleTime &&
    isTask(card) &&
    card.state === "todo";

  const [editingTitle, setEditingTitle] = useState<string>(card.title);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);
  const [dndState, setDndState] = useState<State>(idleState);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const focusableItem = useRegisterFocusItem(
    buildFocusKey(cardWrapper.id, cardWrapper.type),
    orderNumber,
  );

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === "Enter" && !e.shiftKey) || e.key === "Escape") {
      e.preventDefault();

      dispatch(focusSlice.resetEdit());

      // if (e.key === "Enter") {
      //   task.setTitle(editingTitle);
      //   const siblings = taskBox.siblings;
      //   const list = taskBox.listRef.current;
      //   const newItem = list.createChild([taskBox, siblings[1]], listItem);
      //
      //   currentProjectionState.setFocusedItemId(newItem.id);
      // }
    }
  };

  const isFocused = useSyncSelector(
    () => focusSlice.isFocused(focusableItem.key),
    [focusableItem.key],
  );
  const isEditing = useSyncSelector(
    () => focusSlice.isEditing(focusableItem.key),
    [focusableItem.key],
  );
  const select = useSelect();

  const handleTick = useCallback(() => {
    if (!isTask(card)) return;

    const [[up, upModel], [down, downModel]] = select(
      focusManager.getModelSiblings(focusableItem.key),
    );

    const taskState = card.state;
    dispatch(cardsTasksSlice.toggleState(taskId));

    if (!isFocused) return;

    const upTask = upModel && select(cardsSlice.taskOfModel(upModel));
    const downTask = downModel && select(cardsSlice.taskOfModel(downModel));

    if (downTask && downTask.state === taskState) {
      dispatch(focusSlice.focusByKey(down.key));
    } else if (upTask && upTask.state === taskState) {
      dispatch(focusSlice.focusByKey(up.key));
    }
  }, [dispatch, focusableItem.key, isFocused, card, select, taskId]);

  useGlobalListener("keydown", (e: KeyboardEvent) => {
    const isSomethingEditing = select(focusSlice.isSomethingEditing());
    const isFocusDisabled = select(focusSlice.isFocusDisabled());

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

    const getId = (key: FocusKey) => {
      const { id } = parseColumnKey(key);
      return id;
    };


    if (e.code === "Digit1" && noModifiers) {
      e.preventDefault();

      dispatch(
        cardsTasksSlice.update(taskId, {
          horizon: "week",
        }),
      );
    } else if (e.code === "Digit2" && noModifiers) {
      e.preventDefault();

      dispatch(
        cardsTasksSlice.update(taskId, {
          horizon: "month",
        }),
      );
    } else if (e.code === "Digit3" && noModifiers) {
      e.preventDefault();

      dispatch(
        cardsTasksSlice.update(taskId, {
          horizon: "year",
        }),
      );
    } else if (e.code === "Digit4" && noModifiers) {
      e.preventDefault();

      dispatch(
        cardsTasksSlice.update(taskId, {
          horizon: "someday",
        }),
      );
    } else if (e.code === "Space" && noModifiers) {
      e.preventDefault();

      handleTick();
    } else if (e.code === "KeyM" && noModifiers) {
      e.preventDefault();

      // NOTE: this is needed to restore Focus back correctly after modal close
      ref.current?.focus();
      setIsMoveModalOpen(true);
    } else if (isMoveLeft || isMoveRight) {
      e.preventDefault();

      const [leftColumn, rightColumn] = focusManager.getColumnSiblings(
        focusableItem.key,
      );

      const targetColumn = isMoveLeft ? leftColumn : rightColumn;
      if (targetColumn) {
        const id = getId(targetColumn.key);
        const { type } = parseColumnKey(targetColumn.key);

        dispatch(
          appSlice.handleDrop(
            id,
            type,
            cardWrapper.id,
            cardWrapper.type,
            "top",
          ),
        );

        const key = focusableItem.key;
        setTimeout(() => {
          const el = document.querySelector<HTMLElement>(
            `[data-focusable-key="${key}"]`,
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
      if (isTask(card) && card.state === "done") return;

      const [up, down] = focusManager.getSiblings(focusableItem.key);

      const target = isMoveUp ? up : down;
      if (target) {
        const id = getId(target.key);
        if (!id) return;

        const { type } = parseColumnKey(target.key);

        dispatch(
          appSlice.handleDrop(
            id,
            type,
            cardWrapper.id,
            cardWrapper.type,
            isMoveUp ? "top" : "bottom",
          ),
        );

        const key = focusableItem.key;
        setTimeout(() => {
          const el = document.querySelector<HTMLElement>(
            `[data-focusable-key="${key}"]`,
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

      console.log("delete", focusableItem.key);
      const [up, down] = focusManager.getSiblings(focusableItem.key);

      dispatch(appSlice.delete(cardWrapper.id, cardWrapper.type));

      if (down) {
        dispatch(focusSlice.focusByKey(down.key));
      } else if (up) {
        dispatch(focusSlice.focusByKey(up.key));
      } else {
        dispatch(focusSlice.resetFocus());
      }
    } else if ((e.code === "Enter" || e.code === "KeyI") && noModifiers) {
      e.preventDefault();

      dispatch(focusSlice.editByKey(focusableItem.key));
    } else if (isAddAfter || isAddBefore) {
      if (isTask(card) && card.state === "done") return;

      e.preventDefault();

      unstable_batchedUpdates(() => {
        const newBox = dispatch(
          cardsSlice.createSiblingCard(
            cardWrapper,
            isAddAfter ? "after" : "before",
            newTaskParams,
          ),
        );
        dispatch(focusSlice.editByKey(buildFocusKey(newBox.id, newBox.type)));
        // setTimeout(() => {
        // }, 100);
      });

      return;
    }
  });

  // useGlobalListener("mousedown", (e: MouseEvent) => {
  //   const isFocusDisabled = focusSlice.isFocusDisabled(store.getState());
  //
  //   if (
  //     isFocused &&
  //     ref.current &&
  //     !ref.current.contains(e.target as Node) &&
  //     !isFocusDisabled &&
  //     !e.defaultPrevented
  //   ) {
  //     focusSlice.resetFocus(store);
  //   }
  // });

  const handleMove = (projectId: string) => {
    setIsMoveModalOpen(false);
    dispatch(cardsTasksSlice.moveToProject(taskId, projectId));
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
          console.log("canDrop", inp);

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

  // useEffect(() => {
  //   if (isFocused) {
  //     const el = ref.current;
  //     if (!el) return;
  //
  //     // el.scrollIntoView({
  //     //   behavior: "smooth",
  //     //   block: "center",
  //     //   inline: "center",
  //     // });
  //   }
  // }, [isFocused]);

  const prevIsEditing = usePrevious(isEditing);
  const taskTitle = card.title;
  useEffect(() => {
    setEditingTitle(taskTitle);
  }, [taskTitle]);

  useEffect(() => {
    if (!isEditing && prevIsEditing && editingTitle !== taskTitle) {
      dispatch(
        cardsTasksSlice.update(taskId, {
          title: editingTitle,
        }),
      );
    }
  }, [dispatch, editingTitle, isEditing, prevIsEditing, taskId, taskTitle]);

  useUnmount(() => {
    if (editingTitle !== taskTitle) {
      dispatch(
        cardsTasksSlice.update(taskId, {
          title: editingTitle,
        }),
      );
    }
  });

  // const [isHidden, setIsHidden] = useState(false);
  // const isSelfDragging = dragId === taskBox.id;
  // useEffect(() => {
  //   const id = setTimeout(() => {
  //     setIsHidden(
  //       (dndState?.type === "dragging" || dndState?.type === "preview") &&
  //         !isSelfDragging,
  //     );
  //   }, 40);
  //
  //   return () => {
  //     clearTimeout(id);
  //   };
  // }, [dndState, isHidden, isSelfDragging]);
  //
  // console.log(
  //   "isSelfDragging",
  //   "dndState",
  //   dndState.type,
  //   "isSelfDragging",
  //   isSelfDragging,
  // );
  //
  // console.log("isHidden", isHidden);

  return (
    <div className="relative">
      {closestEdge == "top" && <DropTaskIndicator direction="top" />}
      <div
        data-focusable-key={focusableItem.key}
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
        onClick={() => dispatch(focusSlice.focusByKey(focusableItem.key, true))}
        onDoubleClick={() => {
          dispatch(focusSlice.editByKey(focusableItem.key));
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
              "flex justify-between text-sm px-2 py-1.5 text-xs rounded-b-lg",
              isTask(card) && card.state === "done"
                ? "bg-done-panel-tinted text-done-content"
                : "bg-panel-tinted text-content-tinted",
            )}
          >
            <div>{category.title}</div>

            {displayLastScheduleTime && isTask(card) && (
              <TaskDatePicker
                taskId={taskId}
                currentDate={lastScheduleTime}
                trigger={
                  <button
                    className={cn("text-center cursor-pointer ", {
                      "text-amber-400": shouldHighlightTime,
                    })}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {lastScheduleTime
                      ? new Date(lastScheduleTime).toLocaleDateString("en-US", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })
                      : "No Date"}
                  </button>
                }
              />
            )}

            {(alwaysShowProject || displayedUnderProjectId !== project.id) && (
              <button
                className="text-right cursor-pointer"
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

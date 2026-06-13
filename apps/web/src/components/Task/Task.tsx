import { useCallback, useEffect, useRef, useState } from "react";
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
import { unstable_batchedUpdates } from "react-dom";
import { DndModelData, isModelDNDData } from "@/lib/dnd/models";
import { createElementDragPreview } from "@/lib/dnd/dragPreview";
import TextareaAutosize from "react-textarea-autosize";
import { CheckboxComp, ChecklistItems } from "@/components/Checklist/Checklist";
import { focusChecklistItem } from "@/components/Checklist/focus";
import { TaskDropdownMenu } from "./DropdownMenu";
import { taskFloatingIconGroupClassName } from "./styles";
import { MoveModal } from "@/components/MoveTaskModel/MoveModel";
import { useGlobalListener } from "@/components/GlobalListener/hooks.tsx";
import { isInputElement } from "../../utils/isInputElement";
import { useDebouncedPersistedDraft } from "@/hooks/useDebouncedPersistedDraft";
import {
  getDOMAdjacentStackedPlaceholder,
  getDOMColumnSiblingDropTarget,
  getDOMSiblings,
} from "@/components/Focus/domNavigation.ts";
import clsx from "clsx";
import { CircleDashed, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  appSlice,
  cardsSlice,
  checklistItemsSlice,
  projectCategoriesSlice,
  cardsTasksSlice,
  cardsTaskTemplatesSlice,
  dailyListsSlice,
  dailyListsProjectionsSlice,
  AnyModelType,
  type Task,
  type CardWrapperType,
  isTask,
  isTaskTemplate,
  dailyListType,
  projectionType,
  projectCategoryType,
  STASH_ID,
  stashProjectionType,
  stashType,
  taskType,
  getDMY,
  Project,
} from "@will-be-done/slices/space";
import { useDispatch, useSelect, useSyncSelector } from "@will-be-done/hyperdb-lib";
import {
  buildFocusKey,
  focusTextareaAtEnd,
  useFocusStore,
  parseColumnKey,
} from "@/store/focusSlice.ts";
import { projectCategoryCardsSlice } from "@will-be-done/slices/space";
import { useCurrentDate } from "../DaysBoard/hooks";
import { format, startOfDay } from "date-fns";
import { TaskDatePicker } from "./TaskDatePicker";
import { RepeatModal } from "@/components/RepeatModal/RepeatModal";
import {
  useCardDetailsEditRequest,
  useCardDetailsOpen,
} from "@/components/CardDetails/CardDetailsStore.ts";

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

const getFocusKeyForColumnMoveTarget = (
  taskId: string,
  sourceModelType: CardWrapperType,
  targetColumnModelType: string,
  fallbackKey: ReturnType<typeof buildFocusKey>,
) => {
  if (targetColumnModelType === stashType) {
    return buildFocusKey(taskId, stashProjectionType);
  }

  if (targetColumnModelType === dailyListType) {
    return buildFocusKey(taskId, projectionType);
  }

  if (
    targetColumnModelType === projectCategoryType &&
    (sourceModelType === projectionType ||
      sourceModelType === stashProjectionType)
  ) {
    return buildFocusKey(taskId, taskType);
  }

  return fallbackKey;
};

export const PreloadedTaskComp = ({
  card,
  category,
  cardWrapper,
  project,
  lastScheduleTime,

  displayedUnderProjectId,
  alwaysShowProject,
  newTaskParams,
  displayLastScheduleTime,
  centerScheduleDate,
}: {
  card: projectCategoryCardsSlice.Card;
  category: projectCategoriesSlice.ProjectCategory;
  cardWrapper: cardsSlice.CardWrapper;
  project: Project;
  lastScheduleTime: Date | undefined;

  displayedUnderProjectId?: string;
  alwaysShowProject?: boolean;
  newTaskParams?: Partial<Task>;
  displayLastScheduleTime?: boolean;
  centerScheduleDate?: boolean;
}) => {
  const dispatch = useDispatch();

  const taskId = card.id;
  const date = useCurrentDate();
  const shouldHighlightTime =
    lastScheduleTime &&
    startOfDay(date) > lastScheduleTime &&
    isTask(card) &&
    card.state === "todo";
  const taskTitle = card.title;

  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isRepeatModalOpen, setIsRepeatModalOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const titleTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const shouldPlaceTitleCaretAtEndRef = useRef(false);
  const shouldOpenDatePickerAfterActionsCloseRef = useRef(false);
  const focusableItemKey = buildFocusKey(cardWrapper.id, cardWrapper.type);

  const isFocused = useFocusStore(
    (s) => !s.isFocusDisabled && s.focusItemKey === focusableItemKey,
  );
  const isEditing = useFocusStore(
    (s) => !s.isFocusDisabled && s.editItemKey === focusableItemKey,
  );
  const select = useSelect();

  const persistTaskTitle = useCallback(
    (title: string) => {
      if (isTask(card)) {
        if (!select(cardsTasksSlice.byId(taskId))) return;

        dispatch(
          cardsTasksSlice.updateTask(taskId, {
            title,
          }),
        );
        return;
      }

      if (isTaskTemplate(card)) {
        if (!select(cardsTaskTemplatesSlice.byId(taskId))) return;

        dispatch(
          cardsTaskTemplatesSlice.updateTemplate(taskId, {
            title,
          }),
        );
      }
    },
    [card, dispatch, select, taskId],
  );

  const {
    draft: editingTitle,
    setDraft: setEditingTitle,
    flush: flushEditedTitle,
  } = useDebouncedPersistedDraft({
    value: taskTitle,
    persist: persistTaskTitle,
  });

  const handleTick = useCallback(() => {
    if (!isTask(card)) return;

    const [upKey, downKey] = getDOMSiblings(focusableItemKey);

    const taskState = card.state;
    dispatch(cardsTasksSlice.toggleState(taskId));

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

  const handleDelete = useCallback(() => {
    const [upKey, downKey] = getDOMSiblings(focusableItemKey);

    flushEditedTitle();
    dispatch(appSlice.deleteModel(cardWrapper.id, cardWrapper.type));

    if (downKey) {
      useFocusStore.getState().focusByKey(downKey);
    } else if (upKey) {
      useFocusStore.getState().focusByKey(upKey);
    } else {
      useFocusStore.getState().resetFocus();
    }
  }, [
    cardWrapper.id,
    cardWrapper.type,
    dispatch,
    flushEditedTitle,
    focusableItemKey,
  ]);

  const handleMoveColumn = useCallback(
    (direction: "left" | "right") => {
      const dropTarget = getDOMColumnSiblingDropTarget(
        focusableItemKey,
        direction,
      );

      if (!dropTarget) return;

      const targetFocusKey = getFocusKeyForColumnMoveTarget(
        cardWrapper.id,
        cardWrapper.type,
        dropTarget.targetColumnModel.type,
        focusableItemKey,
      );
      const { id, type } = parseColumnKey(dropTarget.targetKey);

      dispatch(
        appSlice.handleDrop(
          id,
          type as AnyModelType,
          cardWrapper.id,
          cardWrapper.type,
          dropTarget.edge,
        ),
      );

      setTimeout(() => {
        if (targetFocusKey !== focusableItemKey) {
          useFocusStore.getState().focusByKey(targetFocusKey);
          return;
        }

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
    },
    [cardWrapper.id, cardWrapper.type, dispatch, focusableItemKey],
  );

  const handleMoveStacked = useCallback(
    (direction: "up" | "down") => {
      const [upKey, downKey] = getDOMSiblings(focusableItemKey, {
        forMove: true,
      });

      let targetKey = direction === "up" ? upKey : downKey;
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
        targetKey = getDOMAdjacentStackedPlaceholder(
          focusableItemKey,
          direction,
        );
        crossedBoundary = targetKey !== null;
      }

      if (!targetKey) return;

      const { id, type } = parseColumnKey(targetKey);
      const edge: Edge = crossedBoundary
        ? direction === "up"
          ? "bottom"
          : "top"
        : direction === "up"
          ? "top"
          : "bottom";

      dispatch(
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
    },
    [cardWrapper.id, cardWrapper.type, dispatch, focusableItemKey],
  );

  const handleAddChecklistItem = useCallback(() => {
    if (!isTask(card) && !isTaskTemplate(card)) return;

    useFocusStore.getState().focusByKey(focusableItemKey, true);
    useFocusStore.getState().resetEdit();

    const item = dispatch(
      checklistItemsSlice.createItem({
        parentId: card.id,
        parentType: card.type,
      }),
    );

    focusChecklistItem(item.id, { root: ref.current });
  }, [card, dispatch, focusableItemKey]);

  const handleAddSiblingTask = useCallback(
    (position: "after" | "before") => {
      if (isTask(card) && card.state === "done") return;

      unstable_batchedUpdates(() => {
        const newBox = dispatch(
          cardsSlice.createSiblingCard(cardWrapper, position, newTaskParams),
        );
        useFocusStore
          .getState()
          .editByKey(buildFocusKey(newBox.id, newBox.type));
      });
    },
    [card, cardWrapper, dispatch, newTaskParams],
  );

  const handleOpenMoveModal = useCallback(() => {
    // NOTE: this is needed to restore Focus back correctly after modal close
    ref.current?.focus();
    setIsMoveModalOpen(true);
  }, []);

  const handleOpenDatePicker = useCallback(() => {
    ref.current?.focus();
    setIsDatePickerOpen(true);
  }, []);

  const handleOpenDatePickerAfterActionsClose = useCallback(() => {
    shouldOpenDatePickerAfterActionsCloseRef.current = true;
    setIsActionsOpen(false);
  }, []);

  const handleScheduleToday = useCallback(() => {
    if (!isTask(card)) return;

    const dailyList = dispatch(
      dailyListsSlice.createIfNotPresent(getDMY(date)),
    );

    dispatch(
      dailyListsProjectionsSlice.addToDailyList(taskId, dailyList.id, "append"),
    );
  }, [card, date, dispatch, taskId]);

  const handleResetSchedule = useCallback(() => {
    if (!isTask(card)) return;

    dispatch(dailyListsProjectionsSlice.removeFromDailyList(taskId));
  }, [card, dispatch, taskId]);

  const handleStashTask = useCallback(() => {
    if (
      !isTask(card) ||
      card.state !== "todo" ||
      cardWrapper.type === stashProjectionType
    ) {
      return;
    }

    const [upKey, downKey] = getDOMSiblings(focusableItemKey);

    dispatch(
      appSlice.handleDrop(
        STASH_ID,
        stashType,
        cardWrapper.id,
        cardWrapper.type,
        "top",
      ),
    );

    if (downKey) {
      useFocusStore.getState().focusByKey(downKey);
    } else if (upKey) {
      useFocusStore.getState().focusByKey(upKey);
    } else {
      useFocusStore.getState().resetFocus();
    }
  }, [card, cardWrapper.id, cardWrapper.type, dispatch, focusableItemKey]);

  const handleConvertToTemplate = useCallback(() => {
    if (!isTask(card) || card.templateId) return;

    ref.current?.focus();
    setIsRepeatModalOpen(true);
  }, [card]);

  const handleConvertToTemplateConfirm = useCallback(
    (ruleString: string) => {
      if (!isTask(card) || card.templateId) return;

      setIsRepeatModalOpen(false);
      flushEditedTitle();

      const task = select(cardsTasksSlice.byId(taskId)) ?? card;
      const template = dispatch(
        cardsTaskTemplatesSlice.createFromTask(task, {
          repeatRule: ruleString,
        }),
      );

      useFocusStore
        .getState()
        .focusByKey(buildFocusKey(template.id, template.type));
    },
    [card, dispatch, flushEditedTitle, select, taskId],
  );

  const handleConvertToTemplateCancel = useCallback(() => {
    setIsRepeatModalOpen(false);
    ref.current?.focus({ preventScroll: true });
  }, []);

  const focusTaskOnOverlayCloseAutoFocus = useCallback((event: Event) => {
    event.preventDefault();

    if (shouldOpenDatePickerAfterActionsCloseRef.current) {
      shouldOpenDatePickerAfterActionsCloseRef.current = false;
      setIsDatePickerOpen(true);
      return;
    }

    ref.current?.setAttribute("data-suppress-focus-visible", "true");
    ref.current?.focus({ preventScroll: true });
  }, []);

  const handleTaskShortcutKeyDown = useCallback(
    (
      e: KeyboardEvent | React.KeyboardEvent,
      source: "task" | "actionsMenu" = "task",
    ) => {
      const isActionsMenuSource = source === "actionsMenu";
      const focusState = useFocusStore.getState();
      const isSomethingEditing =
        !focusState.isFocusDisabled && !!focusState.editItemKey;
      const isFocusDisabled = focusState.isFocusDisabled;
      const runShortcutAction = (
        action: () => void,
        options?: { skipActionsCloseAutoFocus?: boolean },
      ) => {
        e.preventDefault();

        if (isActionsMenuSource) {
          e.stopPropagation();
          setIsActionsOpen(false);
          window.setTimeout(action, 0);
          return options?.skipActionsCloseAutoFocus ?? false;
        }

        action();
        return false;
      };

      if (isSomethingEditing) return false;
      if (!isFocused) return false;
      if (isActionsOpen && !isActionsMenuSource) return false;
      if (isDatePickerOpen) return false;
      if (isFocusDisabled || e.defaultPrevented) return false;

      const target =
        e.target instanceof Element ? e.target : document.activeElement;
      if (target && isInputElement(target)) return false;

      const noModifiers = !(e.shiftKey || e.ctrlKey || e.metaKey || e.altKey);

      const isOpenActions = noModifiers && e.code === "KeyA";
      const isAddAfter = noModifiers && e.code === "KeyO";
      const isAddBefore = e.shiftKey && e.code === "KeyO";

      const isDeleteProjectionTask =
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        e.code === "Space" &&
        cardWrapper.type === projectionType;

      const isMoveUp = e.ctrlKey && (e.code === "ArrowUp" || e.code == "KeyK");
      const isMoveDown =
        e.ctrlKey && (e.code === "ArrowDown" || e.code == "KeyJ");
      const isMoveLeft =
        e.ctrlKey && (e.code === "ArrowLeft" || e.code == "KeyH");
      const isMoveRight =
        e.ctrlKey && (e.code === "ArrowRight" || e.code == "KeyL");
      const isScheduleDate = noModifiers && e.code === "KeyS";
      const isScheduleToday = noModifiers && e.code === "KeyT";
      const isResetSchedule = noModifiers && e.code === "KeyR";
      const isStashTask =
        e.shiftKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        e.code === "KeyS";
      const isConvertToTemplate =
        e.shiftKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        e.code === "KeyT";

      if (e.code === "Digit1" && noModifiers) {
        return runShortcutAction(() => {
          if (isTask(card)) {
            dispatch(cardsTasksSlice.updateTask(taskId, { nature: "red" }));
          } else if (isTaskTemplate(card)) {
            dispatch(
              cardsTaskTemplatesSlice.updateTemplate(taskId, {
                nature: "red",
              }),
            );
          }
        });
      } else if (e.code === "Digit2" && noModifiers) {
        return runShortcutAction(() => {
          if (isTask(card)) {
            dispatch(cardsTasksSlice.updateTask(taskId, { nature: "green" }));
          } else if (isTaskTemplate(card)) {
            dispatch(
              cardsTaskTemplatesSlice.updateTemplate(taskId, {
                nature: "green",
              }),
            );
          }
        });
      } else if (e.code === "Digit3" && noModifiers) {
        return runShortcutAction(() => {
          if (isTask(card)) {
            dispatch(cardsTasksSlice.updateTask(taskId, { nature: "unknown" }));
          } else if (isTaskTemplate(card)) {
            dispatch(
              cardsTaskTemplatesSlice.updateTemplate(taskId, {
                nature: "unknown",
              }),
            );
          }
        });
      } else if (isDeleteProjectionTask) {
        return runShortcutAction(() => {
          const [upKey, downKey] = getDOMSiblings(focusableItemKey);

          dispatch(cardsTasksSlice.deleteTasks([taskId]));

          if (downKey) {
            useFocusStore.getState().focusByKey(downKey);
          } else if (upKey) {
            useFocusStore.getState().focusByKey(upKey);
          } else {
            useFocusStore.getState().resetFocus();
          }
        });
      } else if (e.code === "Space" && noModifiers) {
        return runShortcutAction(handleTick);
      } else if (isOpenActions && !isActionsMenuSource) {
        return runShortcutAction(() => setIsActionsOpen(true));
      } else if (e.code === "KeyM" && noModifiers) {
        return runShortcutAction(handleOpenMoveModal, {
          skipActionsCloseAutoFocus: true,
        });
      } else if (isScheduleDate && isTask(card)) {
        if (isActionsMenuSource) {
          e.preventDefault();
          e.stopPropagation();
          handleOpenDatePickerAfterActionsClose();
          return false;
        }

        return runShortcutAction(handleOpenDatePicker, {
          skipActionsCloseAutoFocus: true,
        });
      } else if (isScheduleToday && isTask(card)) {
        return runShortcutAction(handleScheduleToday);
      } else if (isResetSchedule && isTask(card)) {
        return runShortcutAction(handleResetSchedule);
      } else if (isStashTask && isTask(card)) {
        return runShortcutAction(handleStashTask);
      } else if (isConvertToTemplate && isTask(card) && !card.templateId) {
        return runShortcutAction(handleConvertToTemplate, {
          skipActionsCloseAutoFocus: true,
        });
      } else if (e.code === "KeyC" && noModifiers) {
        return runShortcutAction(handleAddChecklistItem, {
          skipActionsCloseAutoFocus: true,
        });
      } else if (isMoveLeft || isMoveRight) {
        return runShortcutAction(() =>
          handleMoveColumn(isMoveLeft ? "left" : "right"),
        );
      } else if (isMoveUp || isMoveDown) {
        return runShortcutAction(() =>
          handleMoveStacked(isMoveUp ? "up" : "down"),
        );
      } else if (
        (e.code === "Backspace" || e.code === "KeyD" || e.code === "KeyX") &&
        noModifiers
      ) {
        return runShortcutAction(handleDelete);
      } else if ((e.code === "Enter" || e.code === "KeyI") && noModifiers) {
        return runShortcutAction(
          () => {
            shouldPlaceTitleCaretAtEndRef.current = true;
            useFocusStore.getState().editByKey(focusableItemKey);
            titleTextareaRef.current?.focus();
          },
          { skipActionsCloseAutoFocus: true },
        );
      } else if (e.code === "KeyE" && noModifiers) {
        return runShortcutAction(
          () => {
            useCardDetailsOpen.getState().setOpen(true);
            useCardDetailsEditRequest
              .getState()
              .editDescription(cardWrapper.id);
          },
          { skipActionsCloseAutoFocus: true },
        );
      } else if (isAddAfter || isAddBefore) {
        if (isTask(card) && card.state === "done") return false;

        return runShortcutAction(
          () => handleAddSiblingTask(isAddAfter ? "after" : "before"),
          { skipActionsCloseAutoFocus: true },
        );
      }

      return false;
    },
    [
      card,
      cardWrapper.id,
      cardWrapper.type,
      dispatch,
      focusableItemKey,
      handleAddChecklistItem,
      handleAddSiblingTask,
      handleConvertToTemplate,
      handleDelete,
      handleMoveColumn,
      handleMoveStacked,
      handleOpenDatePicker,
      handleOpenDatePickerAfterActionsClose,
      handleOpenMoveModal,
      handleResetSchedule,
      handleScheduleToday,
      handleStashTask,
      handleTick,
      isActionsOpen,
      isDatePickerOpen,
      isFocused,
      taskId,
    ],
  );

  useGlobalListener("keydown", handleTaskShortcutKeyDown);

  const handleAddTaskAfter = useCallback(() => {
    handleAddSiblingTask("after");
  }, [handleAddSiblingTask]);

  const handleAddTaskBefore = useCallback(() => {
    handleAddSiblingTask("before");
  }, [handleAddSiblingTask]);

  const handleMoveUp = useCallback(() => {
    handleMoveStacked("up");
  }, [handleMoveStacked]);

  const handleMoveDown = useCallback(() => {
    handleMoveStacked("down");
  }, [handleMoveStacked]);

  const handleMoveLeft = useCallback(() => {
    handleMoveColumn("left");
  }, [handleMoveColumn]);

  const handleMoveRight = useCallback(() => {
    handleMoveColumn("right");
  }, [handleMoveColumn]);

  const handleActionsShortcutKeyDown = useCallback(
    (event: React.KeyboardEvent) =>
      handleTaskShortcutKeyDown(event, "actionsMenu"),
    [handleTaskShortcutKeyDown],
  );

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

    if (isTask(card)) {
      dispatch(cardsTasksSlice.moveToProject(taskId, projectId));
    } else if (isTaskTemplate(card)) {
      dispatch(
        cardsTaskTemplatesSlice.moveTemplateToProject(taskId, projectId),
      );
    }
  };

  const suspendCardDragForInput = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const target =
        event.target instanceof Element ? event.target : document.activeElement;

      if (!target || !isInputElement(target)) return;

      ref.current?.setAttribute("draggable", "false");
    },
    [],
  );

  const restoreCardDrag = useCallback(() => {
    ref.current?.setAttribute("draggable", "true");
  }, []);

  useEffect(() => {
    const element = ref.current;
    invariant(element);

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
              const preview = createElementDragPreview({
                source: source.element,
                rect,
              });
              container.appendChild(preview);

              return () => {
                preview.remove();
              };
            },
          });
        },
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
  }, [dispatch, select, cardWrapper.id, cardWrapper.type]);

  const focusTitleTextarea = useCallback(() => {
    const textarea = titleTextareaRef.current;
    if (!textarea) return;

    focusTextareaAtEnd(textarea);
  }, []);

  const handleChecklistItemsRemoved = useCallback(() => {
    useFocusStore.getState().editByKey(focusableItemKey);
    window.requestAnimationFrame(focusTitleTextarea);
  }, [focusTitleTextarea, focusableItemKey]);

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

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.key === "Enter" && !e.shiftKey) || e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();

      flushEditedTitle();
      useFocusStore.getState().resetEdit();
      e.currentTarget.blur();
      ref.current?.focus();

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

  const handleTitleFocus = useCallback(() => {
    useFocusStore.getState().editByKey(focusableItemKey);
  }, [focusableItemKey]);

  const handleTitleBlur = useCallback(() => {
    flushEditedTitle();
    useFocusStore.getState().resetEdit();
  }, [flushEditedTitle]);

  useEffect(() => {
    if (!isEditing) return;

    const textarea = titleTextareaRef.current;
    const isTitleAlreadyFocused = document.activeElement === textarea;

    if (isTitleAlreadyFocused && !shouldPlaceTitleCaretAtEndRef.current) {
      return;
    }

    window.requestAnimationFrame(() => {
      shouldPlaceTitleCaretAtEndRef.current = false;
      focusTitleTextarea();
    });
  }, [focusTitleTextarea, isEditing]);

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
        data-focusable-key={focusableItemKey}
        data-ignore-drop={
          isTask(card) && card.state === "done" ? true : undefined
        }
        data-order-token={card.orderToken}
        tabIndex={0}
        className={clsx(
          `group/task relative rounded-lg whitespace-break-spaces [overflow-wrap:anywhere] text-sm ring-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent`,
          "[&[data-suppress-focus-visible=true]]:focus-visible:outline-none",
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
        onBlur={(event) => {
          if (
            event.relatedTarget instanceof Node &&
            event.currentTarget.contains(event.relatedTarget)
          ) {
            return;
          }

          event.currentTarget.removeAttribute("data-suppress-focus-visible");
        }}
        onPointerDownCapture={suspendCardDragForInput}
        onPointerUpCapture={restoreCardDrag}
        onPointerCancelCapture={restoreCardDrag}
        onDoubleClick={() => {
          useFocusStore.getState().editByKey(focusableItemKey);
        }}
        ref={ref}
      >
        {/* {!isSelfDragging && ( */}
        <>
          <div
            className={clsx(
              "pb-2 rounded-t-lg",

              isFocused
                ? isTask(card) && card.state === "done"
                  ? "bg-done-panel"
                  : "bg-panel-hover"
                : isTask(card) && card.state === "done"
                  ? "bg-done-panel"
                  : "bg-panel hover:bg-panel-hover",
            )}
          >
            <div className="absolute right-1.5 top-1.5 z-10 h-5">
              {(isTaskTemplate(card) || (isTask(card) && card.templateId)) && (
                <div
                  className={taskFloatingIconGroupClassName({
                    isShifted: isFocused || isActionsOpen,
                    isDone: isTask(card) && card.state === "done",
                  })}
                >
                  {isTaskTemplate(card) && <CircleDashed className="size-3" />}
                  {isTask(card) && card.templateId && (
                    <RotateCw className="size-3" />
                  )}
                </div>
              )}
              <div className="absolute right-0 top-0">
                <TaskDropdownMenu
                  isFocused={isFocused}
                  isOpen={isActionsOpen}
                  isDone={isTask(card) && card.state === "done"}
                  canMarkDone={isTask(card)}
                  canScheduleTask={isTask(card)}
                  canResetSchedule={isTask(card) && !!lastScheduleTime}
                  canStashTask={
                    isTask(card) &&
                    card.state === "todo" &&
                    cardWrapper.type !== stashProjectionType
                  }
                  canConvertToTemplate={isTask(card) && !card.templateId}
                  canAddChecklistItem={isTask(card) || isTaskTemplate(card)}
                  onOpenChange={setIsActionsOpen}
                  onMarkDone={handleTick}
                  onMoveToProject={handleOpenMoveModal}
                  onStashTask={handleStashTask}
                  onChangeDate={handleOpenDatePickerAfterActionsClose}
                  onScheduleToday={handleScheduleToday}
                  onResetSchedule={handleResetSchedule}
                  onAddTaskAfter={handleAddTaskAfter}
                  onAddTaskBefore={handleAddTaskBefore}
                  onConvertToTemplate={handleConvertToTemplate}
                  onAddChecklistItem={handleAddChecklistItem}
                  onMoveUp={handleMoveUp}
                  onMoveDown={handleMoveDown}
                  onMoveLeft={handleMoveLeft}
                  onMoveRight={handleMoveRight}
                  onDelete={handleDelete}
                  onShortcutKeyDown={handleActionsShortcutKeyDown}
                  onCloseAutoFocus={focusTaskOnOverlayCloseAutoFocus}
                />
                {isTask(card) && !displayLastScheduleTime && (
                  <TaskDatePicker
                    taskId={taskId}
                    currentDate={lastScheduleTime}
                    open={isDatePickerOpen}
                    onOpenChange={setIsDatePickerOpen}
                    onCloseAutoFocus={focusTaskOnOverlayCloseAutoFocus}
                    anchor={
                      <span
                        className="absolute right-0 top-0 h-5 w-5 opacity-0 pointer-events-none"
                        aria-hidden="true"
                      />
                    }
                  />
                )}
                {isRepeatModalOpen && (
                  <RepeatModal
                    onConfirm={handleConvertToTemplateConfirm}
                    onCancel={handleConvertToTemplateCancel}
                  />
                )}
              </div>
            </div>
            <div
              className={clsx(
                "flex items-start gap-1.5 rounded-t-lg px-2 pt-2 font-medium pr-6",
              )}
            >
              {isTask(card) && (
                <div className="flex justify-end">
                  <CheckboxComp
                    checked={card.state === "done"}
                    onChange={handleTick}
                  />
                </div>
              )}
              {isEditing ? (
                <TextareaAutosize
                  ref={titleTextareaRef}
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  onFocus={handleTitleFocus}
                  onBlur={handleTitleBlur}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="off"
                  data-gramm="false"
                  data-gramm_editor="false"
                  data-enable-grammarly="false"
                  data-task-title-input
                  className={cn(
                    "min-h-5 w-full resize-none bg-transparent focus:outline-none",
                    isTask(card) && card.state === "done" && "line-through",
                  )}
                  aria-label="Edit task title"
                />
              ) : (
                <div
                  className={cn("min-h-5 cursor-default", {
                    "line-through": isTask(card) && card.state === "done",
                  })}
                >
                  {card.title}
                </div>
              )}
            </div>
            {(isTask(card) || isTaskTemplate(card)) && (
              <ChecklistItems
                parentId={card.id}
                parentType={card.type}
                visible={isFocused || isEditing}
                focusableItemKey={focusableItemKey}
                editTrigger="doubleClick"
                onItemsRemoved={handleChecklistItemsRemoved}
              />
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
                : (isTask(card) || isTaskTemplate(card)) &&
                    card.nature === "red"
                  ? "bg-nature-red text-nature-red-content"
                  : (isTask(card) || isTaskTemplate(card)) &&
                      card.nature === "green"
                    ? "bg-nature-green text-nature-green-content"
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
                  open={isDatePickerOpen}
                  onOpenChange={setIsDatePickerOpen}
                  onCloseAutoFocus={focusTaskOnOverlayCloseAutoFocus}
                  trigger={
                    <button
                      type="button"
                      className={cn(
                        "flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors cursor-pointer",
                        "hover:bg-black/5 dark:hover:bg-white/5",
                        shouldHighlightTime
                          ? "text-amber-400"
                          : "hover:text-content",
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
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
                onClick={handleOpenMoveModal}
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

  return (
    <PreloadedTaskComp
      card={card}
      category={category}
      cardWrapper={cardWrapper}
      project={project}
      lastScheduleTime={lastScheduleTime}
      displayedUnderProjectId={displayedUnderProjectId}
      alwaysShowProject={alwaysShowProject}
      newTaskParams={newTaskParams}
      displayLastScheduleTime={displayLastScheduleTime}
      centerScheduleDate={centerScheduleDate}
    />
  );
};

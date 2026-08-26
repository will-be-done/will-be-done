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
  addToDailyList,
  AnyModelType,
  appById,
  appDeleteModel,
  appHandleDrop,
  Item,
  ListItem,
  listItemByIdOrDefault,
  type ListItemType,
  createDailyListIfNotPresent,
  createItem,
  createTaskNextToListItem,
  createTaskTemplateFromTask,
  dailyListType,
  dailyEntryDateOfTask,
  dailyEntryByTaskId,
  deleteTasks,
  getDMY,
  isTask,
  isTaskTemplate,
  moveTaskToProject,
  moveTemplateToProject,
  Project,
  ProjectSection,
  projectSectionByIdOrDefault,
  projectSectionItemByIdOrDefault,
  projectSectionType,
  dailyEntryType,
  projectOfProjectSectionOrDefault,
  removeFromDailyList,
  STASH_ID,
  stashEntryType,
  stashEntryByTaskId,
  stashType,
  type Task,
  taskById,
  taskOfModel,
  taskTemplateById,
  taskType,
  toggleTaskState,
  updateTask,
  updateTemplate,
} from "@will-be-done/slices/space";
import { useAsyncDispatch } from "@will-be-done/hyperdb/react";
import { useAsyncSelector, useSelectAsync } from "@will-be-done/hyperdb/react";
import {
  buildFocusKey,
  focusTextareaAtEnd,
  useFocusStore,
  parseColumnKey,
} from "@/store/focusSlice.ts";

import { useCurrentDate } from "../DaysBoard/hooks";
import { format, startOfDay } from "date-fns";
import { TaskDatePicker } from "./TaskDatePicker";
import { RepeatModal } from "@/components/RepeatModal/RepeatModal";
import {
  useItemDetailsEditRequest,
  useItemDetailsOpen,
} from "@/components/ItemDetails/ItemDetailsStore.ts";
import { useOpenProject } from "@/hooks/useOpenProject.ts";
import { captureWebAnalytics } from "@/lib/analytics";

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
  targetModelId: string,
  sourceModelType: ListItemType,
  targetColumnModelType: string,
  fallbackKey: ReturnType<typeof buildFocusKey>,
) => {
  if (targetColumnModelType === stashType) {
    return buildFocusKey(targetModelId, stashEntryType);
  }

  if (targetColumnModelType === dailyListType) {
    return buildFocusKey(targetModelId, dailyEntryType);
  }

  if (
    targetColumnModelType === projectSectionType &&
    (sourceModelType === dailyEntryType || sourceModelType === stashEntryType)
  ) {
    return buildFocusKey(targetModelId, taskType);
  }

  return fallbackKey;
};

export const PreloadedTaskComp = ({
  item,
  section,
  listItem,
  project,
  lastScheduleTime,
  hasCheclistItems,

  displayedUnderProjectId,
  alwaysShowProject,
  newTaskParams,
  displayLastScheduleTime,
  centerScheduleDate,
  isOnTimeline,
}: {
  item: Item;
  section: ProjectSection;
  listItem: ListItem;
  project: Project;
  lastScheduleTime: Date | undefined;
  hasCheclistItems: boolean | undefined;

  displayedUnderProjectId?: string;
  alwaysShowProject?: boolean;
  newTaskParams?: Partial<Task>;
  displayLastScheduleTime?: boolean;
  centerScheduleDate?: boolean;
  isOnTimeline?: boolean;
}) => {
  const dispatch = useAsyncDispatch();

  const taskId = item.id;
  const date = useCurrentDate();
  const shouldHighlightTime =
    lastScheduleTime &&
    startOfDay(date) > lastScheduleTime &&
    isTask(item) &&
    item.state === "todo";
  const taskTitle = item.title;

  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isRepeatModalOpen, setIsRepeatModalOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const titleTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const shouldPlaceTitleCaretAtEndRef = useRef(false);
  const shouldOpenDatePickerAfterActionsCloseRef = useRef(false);
  const focusableItemKey = buildFocusKey(listItem.id, listItem.type);

  const isFocused = useFocusStore(
    (s) => !s.isFocusDisabled && s.focusItemKey === focusableItemKey,
  );
  const isEditing = useFocusStore(
    (s) => !s.isFocusDisabled && s.editItemKey === focusableItemKey,
  );
  const select = useSelectAsync();
  const openProject = useOpenProject();

  const persistTaskTitle = useCallback(
    (title: string) => {
      void (async () => {
        if (isTask(item)) {
          if (
            !(await select({
              selector: taskById,
              args: { id: taskId },
            }))
          ) {
            return;
          }

          await dispatch(
            updateTask({
              id: taskId,
              task: {
                title,
              },
            }),
          );
          return;
        }

        if (isTaskTemplate(item)) {
          if (
            !(await select({
              selector: taskTemplateById,
              args: { id: taskId },
            }))
          ) {
            return;
          }

          await dispatch(
            updateTemplate({
              id: taskId,
              template: {
                title,
              },
            }),
          );
        }
      })();
    },
    [item, dispatch, select, taskId],
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
    if (!isTask(item)) return;

    void (async () => {
      const [upKey, downKey] = getDOMSiblings(focusableItemKey);

      const taskState = item.state;
      await dispatch(toggleTaskState({ taskId: taskId }));
      captureWebAnalytics({
        name: taskState === "todo" ? "task_completed" : "task_reopened",
        properties: {
          age_hours: Math.max(
            0,
            Math.round(((Date.now() - item.createdAt) / 3_600_000) * 10) / 10,
          ),
        },
      });

      if (!isFocused) return;

      const upModel = upKey
        ? await select({
            selector: appById,
            args: {
              id: parseColumnKey(upKey).id,
              modelType: parseColumnKey(upKey).type,
            },
          })
        : undefined;
      const downModel = downKey
        ? await select({
            selector: appById,
            args: {
              id: parseColumnKey(downKey).id,
              modelType: parseColumnKey(downKey).type,
            },
          })
        : undefined;

      const upTask =
        upModel?.type !== projectSectionType && upModel
          ? await select({ selector: taskOfModel, args: { model: upModel } })
          : undefined;
      const downTask =
        downModel?.type !== projectSectionType && downModel
          ? await select({ selector: taskOfModel, args: { model: downModel } })
          : undefined;

      if (downTask && downTask.state === taskState) {
        useFocusStore.getState().focusByKey(downKey!);
      } else if (upTask && upTask.state === taskState) {
        useFocusStore.getState().focusByKey(upKey!);
      }
    })();
  }, [dispatch, focusableItemKey, isFocused, item, select, taskId]);

  const handleDelete = useCallback(() => {
    const [upKey, downKey] = getDOMSiblings(focusableItemKey);

    flushEditedTitle();
    void dispatch(
      appDeleteModel({ id: listItem.id, modelType: listItem.type }),
    );

    if (downKey) {
      useFocusStore.getState().focusByKey(downKey);
    } else if (upKey) {
      useFocusStore.getState().focusByKey(upKey);
    } else {
      useFocusStore.getState().resetFocus();
    }
  }, [
    listItem.id,
    listItem.type,
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

      const { id, type } = parseColumnKey(dropTarget.targetKey);

      void (async () => {
        await dispatch(
          appHandleDrop({
            id: id,
            modelType: type as AnyModelType,
            dropId: listItem.id,
            dropModelType: listItem.type,
            edge: dropTarget.edge,
          }),
        );

        let targetModelId = taskId;
        if (dropTarget.targetColumnModel.type === stashType) {
          const entry = await select({
            selector: stashEntryByTaskId,
            args: { taskId },
          });
          if (entry) targetModelId = entry.id;
        } else if (dropTarget.targetColumnModel.type === dailyListType) {
          const entry = await select({
            selector: dailyEntryByTaskId,
            args: { taskId },
          });
          if (entry) targetModelId = entry.id;
        }
        const targetFocusKey = getFocusKeyForColumnMoveTarget(
          targetModelId,
          listItem.type,
          dropTarget.targetColumnModel.type,
          focusableItemKey,
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
      })();
    },
    [listItem.id, listItem.type, dispatch, focusableItemKey, select, taskId],
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
      const targetColumn = document
        .querySelector(`[data-focusable-key="${targetKey}"]`)
        ?.closest("[data-focus-column]");
      const targetColumnModelType = targetColumn?.getAttribute(
        "data-column-model-type",
      );
      if (!targetColumn || !targetColumnModelType) return;
      const edge: Edge = crossedBoundary
        ? direction === "up"
          ? "bottom"
          : "top"
        : direction === "up"
          ? "top"
          : "bottom";

      void (async () => {
        await dispatch(
          appHandleDrop({
            id: id,
            modelType: type,
            dropId: listItem.id,
            dropModelType: listItem.type,
            edge: edge,
          }),
        );

        let targetModelId = taskId;
        if (targetColumnModelType === stashType) {
          const entry = await select({
            selector: stashEntryByTaskId,
            args: { taskId },
          });
          if (entry) targetModelId = entry.id;
        } else if (targetColumnModelType === dailyListType) {
          const entry = await select({
            selector: dailyEntryByTaskId,
            args: { taskId },
          });
          if (entry) targetModelId = entry.id;
        }
        const targetFocusKey = getFocusKeyForColumnMoveTarget(
          targetModelId,
          listItem.type,
          targetColumnModelType,
          focusableItemKey,
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
      })();
    },
    [listItem.id, listItem.type, dispatch, focusableItemKey, select, taskId],
  );

  const handleAddChecklistItem = useCallback(() => {
    if (!isTask(item) && !isTaskTemplate(item)) return;

    useFocusStore.getState().focusByKey(focusableItemKey, true);
    useFocusStore.getState().resetEdit();

    void (async () => {
      const checklistItem = await dispatch(
        createItem({
          item: {
            parentId: item.id,
            parentType: item.type,
          },
        }),
      );
      captureWebAnalytics({
        name: "checklist_item_created",
        properties: { creation_method: "web" },
      });

      focusChecklistItem(checklistItem.id, { root: ref.current });
    })();
  }, [item, dispatch, focusableItemKey]);

  const handleAddSiblingTask = useCallback(
    (position: "after" | "before") => {
      if (isTask(item) && item.state === "done") return;

      void (async () => {
        const newBox = await dispatch(
          createTaskNextToListItem({
            listItem: listItem,
            position: position,
            taskParams: newTaskParams,
          }),
        );
        const location =
          listItem.type === dailyEntryType
            ? "daily_list"
            : listItem.type === stashEntryType
              ? "stash"
              : "project";
        captureWebAnalytics({
          name: "task_created",
          properties: { creation_method: "sibling", location },
        });
        unstable_batchedUpdates(() => {
          useFocusStore
            .getState()
            .editByKey(buildFocusKey(newBox.id, newBox.type));
        });
      })();
    },
    [item, listItem, dispatch, newTaskParams],
  );

  const handleOpenMoveModal = useCallback(() => {
    // NOTE: this is needed to restore Focus back correctly after modal close
    ref.current?.focus();
    setIsMoveModalOpen(true);
  }, []);

  const handleOpenProject = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      openProject(project.id);
    },
    [openProject, project.id],
  );

  const handleOpenDatePicker = useCallback(() => {
    ref.current?.focus();
    setIsDatePickerOpen(true);
  }, []);

  const handleOpenDatePickerAfterActionsClose = useCallback(() => {
    shouldOpenDatePickerAfterActionsCloseRef.current = true;
    setIsActionsOpen(false);
  }, []);

  const handleScheduleToday = useCallback(() => {
    if (!isTask(item)) return;

    void (async () => {
      const dailyList = await dispatch(
        createDailyListIfNotPresent({ date: getDMY(date) }),
      );

      await dispatch(
        addToDailyList({
          taskId: taskId,
          dailyListId: dailyList.id,
          position: "append",
        }),
      );
      captureWebAnalytics({
        name: "task_scheduled",
        properties: { days_ahead: 0, scheduling_method: "today_shortcut" },
      });
    })();
  }, [item, date, dispatch, taskId]);

  const handleResetSchedule = useCallback(() => {
    if (!isTask(item)) return;

    void dispatch(removeFromDailyList({ taskId: taskId }));
  }, [item, dispatch, taskId]);

  const handleStashTask = useCallback(() => {
    if (
      !isTask(item) ||
      item.state !== "todo" ||
      listItem.type === stashEntryType
    ) {
      return;
    }

    const [upKey, downKey] = getDOMSiblings(focusableItemKey);

    void dispatch(
      appHandleDrop({
        id: STASH_ID,
        modelType: stashType,
        dropId: listItem.id,
        dropModelType: listItem.type,
        edge: "top",
      }),
    );

    if (downKey) {
      useFocusStore.getState().focusByKey(downKey);
    } else if (upKey) {
      useFocusStore.getState().focusByKey(upKey);
    } else {
      useFocusStore.getState().resetFocus();
    }
  }, [item, listItem.id, listItem.type, dispatch, focusableItemKey]);

  const handleConvertToTemplate = useCallback(() => {
    if (!isTask(item) || item.templateId) return;

    ref.current?.focus();
    setIsRepeatModalOpen(true);
  }, [item]);

  const handleConvertToTemplateConfirm = useCallback(
    (ruleString: string) => {
      if (!isTask(item) || item.templateId) return;

      setIsRepeatModalOpen(false);
      flushEditedTitle();

      void (async () => {
        const task =
          (await select({ selector: taskById, args: { id: taskId } })) ?? item;
        const template = await dispatch(
          createTaskTemplateFromTask({
            task: task,
            now: Date.now(),
            data: {
              repeatRule: ruleString,
            },
          }),
        );

        useFocusStore
          .getState()
          .focusByKey(buildFocusKey(template.id, template.type));
      })();
    },
    [item, dispatch, flushEditedTitle, select, taskId],
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

      const isDeleteDailyEntryTask =
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        e.code === "Backspace" &&
        listItem.type === dailyEntryType;

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
          if (isTask(item)) {
            void dispatch(updateTask({ id: taskId, task: { nature: "red" } }));
          } else if (isTaskTemplate(item)) {
            void dispatch(
              updateTemplate({
                id: taskId,
                template: {
                  nature: "red",
                },
              }),
            );
          }
        });
      } else if (e.code === "Digit2" && noModifiers) {
        return runShortcutAction(() => {
          if (isTask(item)) {
            void dispatch(
              updateTask({ id: taskId, task: { nature: "green" } }),
            );
          } else if (isTaskTemplate(item)) {
            void dispatch(
              updateTemplate({
                id: taskId,
                template: {
                  nature: "green",
                },
              }),
            );
          }
        });
      } else if (e.code === "Digit3" && noModifiers) {
        return runShortcutAction(() => {
          if (isTask(item)) {
            void dispatch(
              updateTask({ id: taskId, task: { nature: "unknown" } }),
            );
          } else if (isTaskTemplate(item)) {
            void dispatch(
              updateTemplate({
                id: taskId,
                template: {
                  nature: "unknown",
                },
              }),
            );
          }
        });
      } else if (isDeleteDailyEntryTask) {
        return runShortcutAction(() => {
          const [upKey, downKey] = getDOMSiblings(focusableItemKey);

          void dispatch(deleteTasks({ ids: [taskId] }));

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
      } else if (isScheduleDate && isTask(item)) {
        if (isActionsMenuSource) {
          e.preventDefault();
          e.stopPropagation();
          handleOpenDatePickerAfterActionsClose();
          return false;
        }

        return runShortcutAction(handleOpenDatePicker, {
          skipActionsCloseAutoFocus: true,
        });
      } else if (isScheduleToday && isTask(item)) {
        return runShortcutAction(handleScheduleToday);
      } else if (isResetSchedule && isTask(item)) {
        return runShortcutAction(handleResetSchedule);
      } else if (isStashTask && isTask(item)) {
        return runShortcutAction(handleStashTask);
      } else if (isConvertToTemplate && isTask(item) && !item.templateId) {
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
            useItemDetailsOpen.getState().setOpen(true);
            useItemDetailsEditRequest.getState().editDescription(taskId);
          },
          { skipActionsCloseAutoFocus: true },
        );
      } else if (isAddAfter || isAddBefore) {
        if (isTask(item) && item.state === "done") return false;

        return runShortcutAction(
          () => handleAddSiblingTask(isAddAfter ? "after" : "before"),
          { skipActionsCloseAutoFocus: true },
        );
      }

      return false;
    },
    [
      item,
      taskId,
      listItem.type,
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

    if (isTask(item)) {
      void dispatch(
        moveTaskToProject({ taskId: taskId, projectId: projectId }),
      );
    } else if (isTaskTemplate(item)) {
      void dispatch(
        moveTemplateToProject({ templateId: taskId, projectId: projectId }),
      );
    }
  };

  const suspendItemDragForInput = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const target =
        event.target instanceof Element ? event.target : document.activeElement;

      if (!target || !isInputElement(target)) return;

      ref.current?.setAttribute("draggable", "false");
    },
    [],
  );

  const restoreItemDrag = useCallback(() => {
    ref.current?.setAttribute("draggable", "true");
  }, []);

  useEffect(() => {
    const element = ref.current;
    invariant(element);

    return combine(
      draggable({
        element: element,
        getInitialData: (): DndModelData => ({
          modelId: listItem.id,
          modelType: listItem.type,
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

          return true;
        },
        getIsSticky: () => true,
        getData: ({ input, element }) => {
          const data: DndModelData = {
            modelId: listItem.id,
            modelType: listItem.type,
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
  }, [dispatch, select, listItem.id, listItem.type]);

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
      //   const siblings = listItem.siblings;
      //   const list = listItem.listRef.current;
      //   const newItem = list.createChild([listItem, siblings[1]], listItem);
      //
      //   currentDailyEntryState.setFocusedItemId(newItem.id);
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
  // const isSelfDragging = dragId === listItem.id;
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
          isTask(item) && item.state === "done" ? true : undefined
        }
        data-order-token={item.orderToken}
        tabIndex={0}
        className={clsx(
          `group/task relative rounded-lg whitespace-break-spaces [overflow-wrap:anywhere] text-sm ring-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent`,
          "[&[data-suppress-focus-visible=true]]:focus-visible:outline-none",
          isFocused
            ? isTask(item) && item.state === "done"
              ? isOnTimeline
                ? "ring-ring outline-2 outline-dashed outline-done-panel-selected focus-visible:outline-dashed text-done-content"
                : "ring-2 ring-done-panel-selected text-done-content"
              : isOnTimeline
                ? "ring-ring outline-2 outline-dashed outline-accent focus-visible:outline-dashed text-content"
                : "ring-2 ring-accent text-content"
            : isTask(item) && item.state === "done"
              ? isOnTimeline
                ? "ring-done-ring outline-2 outline-dashed outline-done-panel-selected text-done-content hover:ring-ring-hover"
                : "ring-done-ring text-done-content hover:ring-ring-hover"
              : isOnTimeline
                ? "ring-ring outline-2 outline-dashed outline-content-tinted-2 text-content hover:ring-ring-hover"
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
        onPointerDownCapture={suspendItemDragForInput}
        onPointerUpCapture={restoreItemDrag}
        onPointerCancelCapture={restoreItemDrag}
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
                ? isTask(item) && item.state === "done"
                  ? "bg-done-panel"
                  : "bg-panel-hover"
                : isTask(item) && item.state === "done"
                  ? "bg-done-panel"
                  : "bg-panel hover:bg-panel-hover",
            )}
          >
            <div className="absolute right-1.5 top-1.5 z-10 h-5">
              {(isTaskTemplate(item) || (isTask(item) && item.templateId)) && (
                <div
                  className={taskFloatingIconGroupClassName({
                    isShifted: isFocused || isActionsOpen,
                    isDone: isTask(item) && item.state === "done",
                  })}
                >
                  {isTaskTemplate(item) && <CircleDashed className="size-3" />}
                  {isTask(item) && item.templateId && (
                    <RotateCw className="size-3" />
                  )}
                </div>
              )}
              <div className="absolute right-0 top-0">
                <TaskDropdownMenu
                  isFocused={isFocused}
                  isOpen={isActionsOpen}
                  isDone={isTask(item) && item.state === "done"}
                  canMarkDone={isTask(item)}
                  canScheduleTask={isTask(item)}
                  canResetSchedule={isTask(item) && !!lastScheduleTime}
                  canStashTask={
                    isTask(item) &&
                    item.state === "todo" &&
                    listItem.type !== stashEntryType
                  }
                  canConvertToTemplate={isTask(item) && !item.templateId}
                  canAddChecklistItem={isTask(item) || isTaskTemplate(item)}
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
                {isTask(item) && !displayLastScheduleTime && (
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
              {isTask(item) && (
                <div className="flex justify-end">
                  <CheckboxComp
                    checked={item.state === "done"}
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
                    isTask(item) && item.state === "done" && "line-through",
                  )}
                  aria-label="Edit task title"
                />
              ) : (
                <div
                  className={cn("min-h-5 cursor-default", {
                    "line-through": isTask(item) && item.state === "done",
                  })}
                >
                  {item.title}
                </div>
              )}
            </div>
            {(isTask(item) || isTaskTemplate(item)) && (
              <ChecklistItems
                hasChecklistItems={hasCheclistItems}
                parentId={item.id}
                parentType={item.type}
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
              isTask(item) && item.state === "done"
                ? "bg-done-panel-tinted text-done-content"
                : (isTask(item) || isTaskTemplate(item)) &&
                    item.nature === "red"
                  ? "bg-nature-red text-nature-red-content"
                  : (isTask(item) || isTaskTemplate(item)) &&
                      item.nature === "green"
                    ? "bg-nature-green text-nature-green-content"
                    : "bg-panel-tinted text-content-tinted",
            )}
          >
            <div>{section.title}</div>

            {displayLastScheduleTime && isTask(item) && (
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
                onClick={handleOpenProject}
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
// TODO: think about to remove listItem
export const TaskComp = ({
  taskId,
  listItemId,
  listItemType,
  displayedUnderProjectId,
  alwaysShowProject,
  newTaskParams,
  displayLastScheduleTime,
  centerScheduleDate,
}: {
  taskId: string;
  listItemId: string;
  listItemType: ListItemType;
  displayedUnderProjectId?: string;
  alwaysShowProject?: boolean;
  newTaskParams?: Partial<Task>;
  displayLastScheduleTime?: boolean;
  centerScheduleDate?: boolean;
}) => {
  const { data: item } = useAsyncSelector({
    selector: projectSectionItemByIdOrDefault,
    args: { id: taskId },
  });
  const { data: section } = useAsyncSelector({
    selector: projectSectionByIdOrDefault,
    args: { id: item?.projectSectionId ?? "" },
    enabled: !!item,
  });
  const { data: listItem } = useAsyncSelector({
    selector: listItemByIdOrDefault,
    args: { id: listItemId, modelType: listItemType },
  });
  const { data: project } = useAsyncSelector({
    selector: projectOfProjectSectionOrDefault,
    args: { projectSectionId: item?.projectSectionId ?? "" },
    enabled: !!item,
  });
  const { data: lastScheduleTime } = useAsyncSelector({
    selector: dailyEntryDateOfTask,
    args: { taskId: taskId },
  });

  if (!item || !section || !listItem || !project) return null;

  return (
    <PreloadedTaskComp
      item={item}
      section={section}
      listItem={listItem}
      project={project}
      lastScheduleTime={lastScheduleTime}
      displayedUnderProjectId={displayedUnderProjectId}
      alwaysShowProject={alwaysShowProject}
      newTaskParams={newTaskParams}
      displayLastScheduleTime={displayLastScheduleTime}
      centerScheduleDate={centerScheduleDate}
      hasCheclistItems={undefined}
    />
  );
};

import { useAppSelector, useAppStore } from "@/hooks/stateHooks.ts";
import { appSlice } from "@/store/slices/appSlice";
import {
  buildFocusKey,
  focusSlice,
  parseColumnKey,
} from "@/store/slices/focusSlice.ts";
import { projectItemsSlice } from "@/store/slices/projectItemsSlice";
import { isTask, Task, taskType } from "@/store/slices/tasksSlice";
import {
  isTaskTemplate,
  TaskTemplate,
  taskTemplatesSlice,
  taskTemplateType,
} from "@/store/slices/taskTemplatesSlice";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "../ui/dialog";
import { useState } from "react";
import { RepeatConfigModal } from "./RepeatConfigModal";

// TODO: rename to ModelDetails
export const Details = () => {
  const currentFocusKey = useAppSelector((state) => state.focus.focusItemKey);
  const { id } = currentFocusKey ? parseColumnKey(currentFocusKey) : {};
  const item = useAppSelector((state) => appSlice.byId(state, id || ""));

  if (isTask(item)) {
    return <TaskDetails task={item} />;
  } else if (isTaskTemplate(item)) {
    return <TaskTemplateDetails taskTemplate={item} />;
  } else {
    return null;
  }
};

export const TaskDetails = ({ task }: { task: Task }) => {
  const lastToggledAt = new Date(task.lastToggledAt);
  const createdAt = new Date(task.createdAt);
  const store = useAppStore();

  const [isRRuleModalOpen, setRRuleModalOpen] = useState(false);

  const currentFocusKey = useAppSelector((state) => state.focus.focusItemKey);
  const parsedFocusKey = currentFocusKey
    ? parseColumnKey(currentFocusKey)
    : undefined;

  return (
    <div>
      <h1 className="whitespace-break-spaces [overflow-wrap:anywhere]">
        {task.title}
      </h1>

      <div className="mt-4">
        Last toggled at: {lastToggledAt.toLocaleString()}
      </div>
      <div>Created at: {createdAt.toLocaleString()}</div>

      <button type="button" onClick={() => setRRuleModalOpen(true)}>
        Make template
      </button>

      {isRRuleModalOpen && (
        <RepeatConfigModal
          isOpen={isRRuleModalOpen}
          onClose={() => setRRuleModalOpen(false)}
          onOk={(data, rule) => {
            console.log(data, rule.toString());
            setRRuleModalOpen(false);
            // TODO: handle rrule config result here
          }}
        />
      )}
    </div>
  );
};

export const TaskTemplateDetails = ({
  taskTemplate,
}: {
  taskTemplate: TaskTemplate;
}) => {
  const store = useAppStore();
  const currentFocusKey = useAppSelector((state) => state.focus.focusItemKey);
  const parsedFocusKey = currentFocusKey
    ? parseColumnKey(currentFocusKey)
    : undefined;

  const ruleText = useAppSelector((state) =>
    taskTemplatesSlice.ruleText(state, taskTemplate.id),
  );

  return (
    <div>
      <h1 className="whitespace-break-spaces [overflow-wrap:anywhere]">
        {taskTemplate.title}
      </h1>
      <div>It's task template!</div>
      <div className="my-2">Repeat freq: {ruleText}</div>
      <button
        type="button"
        onClick={() => {
          const task = projectItemsSlice.toggleItemType(
            store,
            taskTemplate,
            taskType,
          );

          // TODO: force react to rerender

          if (parsedFocusKey) {
            // setTimeout(() => {
            focusSlice.focusByKey(
              store,
              buildFocusKey(task.id, task.type, parsedFocusKey.component),
              true,
            );
            // }, 0);
          }
        }}
      >
        Make task
      </button>
    </div>
  );
};

import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useAsyncDispatch } from "@will-be-done/hyperdb/react";
import {
  appDeleteModel,
  isTask,
  isTaskTemplate,
  toggleTaskState,
  updateTask,
  updateTemplate,
  type ItemForDisplay,
} from "@will-be-done/slices/space";
import { formatScheduleDate } from "@will-be-done/client/utils";
import { startOfDay } from "date-fns";
import Svg, { Path, Rect } from "react-native-svg";
import { CircleDashed, RotateCw, Trash2 } from "lucide-react-native";
import { Checkbox } from "./Checkbox";
import { LinkifiedText } from "./LinkifiedText";
import { Text, TextInput } from "./Text";
import { showActionSheet } from "./overlays";
import { cx } from "@/lib/cx";

// Mobile counterpart of the web PreloadedTaskComp: title panel on top, footer
// with the section and the schedule date.
export function TaskCard({
  display,
  isEditing,
  onEditingChange,
}: {
  display: ItemForDisplay;
  isEditing: boolean;
  onEditingChange: (editing: boolean) => void;
}) {
  const dispatch = useAsyncDispatch();
  const { item, section, lastScheduleTime } = display;
  const isDone = isTask(item) && item.state === "done";
  const nature = isTask(item) || isTaskTemplate(item) ? item.nature : undefined;
  const isOverdue =
    lastScheduleTime !== undefined &&
    startOfDay(new Date()) > lastScheduleTime &&
    isTask(item) &&
    item.state === "todo";

  const [draft, setDraft] = useState(item.title);
  useEffect(() => {
    if (!isEditing) setDraft(item.title);
  }, [isEditing, item.title]);

  const saveTitle = () => {
    onEditingChange(false);
    if (draft === item.title) return;
    if (isTask(item)) {
      void dispatch(updateTask({ id: item.id, task: { title: draft } }));
    } else if (isTaskTemplate(item)) {
      void dispatch(
        updateTemplate({ id: item.id, template: { title: draft } }),
      );
    }
  };

  const openActions = () =>
    showActionSheet({
      title: item.title || "Untitled",
      actions: [
        {
          label: "Delete",
          icon: Trash2,
          destructive: true,
          onPress: () =>
            void dispatch(
              appDeleteModel({ id: item.id, modelType: item.type }),
            ),
        },
      ],
    });

  const textColor = isDone ? "text-done-content" : "text-content";

  return (
    <Pressable
      onPress={() => onEditingChange(true)}
      onLongPress={openActions}
      className="rounded-lg"
    >
      <View
        className={cx(
          "rounded-t-lg pb-2",
          isDone ? "bg-done-panel" : "bg-panel",
        )}
      >
        <View className="flex-row items-start gap-1.5 px-2 pt-2 pr-6">
          {isTask(item) && (
            <Checkbox
              checked={isDone}
              onChange={() =>
                void dispatch(toggleTaskState({ taskId: item.id }))
              }
            />
          )}
          {isEditing ? (
            <TextInput
              autoFocus
              multiline
              value={draft}
              onChangeText={setDraft}
              onBlur={saveTitle}
              submitBehavior="blurAndSubmit"
              returnKeyType="done"
              selectionColor="#3b82f6"
              className={cx(
                "min-h-5 flex-1 p-0 text-sm leading-5 font-inter-medium",
                textColor,
                isDone && "line-through",
              )}
              style={{ textAlignVertical: "top" }}
            />
          ) : (
            <Text
              className={cx(
                "min-h-5 flex-1 text-sm leading-5 font-inter-medium",
                textColor,
                isDone && "line-through",
              )}
            >
              <LinkifiedText text={item.title} />
            </Text>
          )}
        </View>
        {(isTaskTemplate(item) || (isTask(item) && item.templateId)) && (
          <View
            className={cx(
              "absolute right-1.5 top-1.5 h-5 min-w-5 items-center justify-center rounded-sm px-1",
              isDone ? "bg-done-panel-tinted/95" : "bg-panel/90",
            )}
          >
            {isTaskTemplate(item) ? (
              <CircleDashed size={12} color="#cbd5e1" />
            ) : (
              <RotateCw size={12} color="#cbd5e1" />
            )}
          </View>
        )}
      </View>
      <View
        className={cx(
          "flex-row items-center justify-between rounded-b-lg px-2 py-1.5",
          isDone
            ? "bg-done-panel-tinted"
            : nature === "red"
              ? "bg-nature-red"
              : nature === "green"
                ? "bg-nature-green"
                : "bg-panel-tinted",
        )}
      >
        <Text className={cx("text-xs", footerText(isDone, nature))}>
          {section.title}
        </Text>
        {isTask(item) && (
          <View className="flex-row items-center gap-1 px-1.5 py-0.5">
            <CalendarIcon
              color={isOverdue ? "#fbbf24" : footerIconColor(isDone, nature)}
            />
            <Text
              className={cx(
                "text-xs",
                isOverdue ? "text-amber-400" : footerText(isDone, nature),
              )}
            >
              {formatScheduleDate(lastScheduleTime)}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const footerText = (isDone: boolean, nature: string | undefined) =>
  isDone
    ? "text-done-content"
    : nature === "red"
      ? "text-nature-red-content"
      : nature === "green"
        ? "text-nature-green-content"
        : "text-content-tinted";

// Hex equivalents of the footer text tokens, for SVG strokes.
const footerIconColor = (isDone: boolean, nature: string | undefined) =>
  isDone
    ? "#94a3b8"
    : nature === "red"
      ? "#c2878e"
      : nature === "green"
        ? "#7fa58f"
        : "#cbd5e1";

function CalendarIcon({ color }: { color: string }) {
  return (
    <Svg width={10} height={10} viewBox="0 0 10 10" fill="none">
      <Rect x="0.5" y="1.5" width="9" height="8" rx="1.5" stroke={color} />
      <Path d="M3 0.5V2.5M7 0.5V2.5" stroke={color} strokeLinecap="round" />
      <Path d="M0.5 4.5H9.5" stroke={color} />
    </Svg>
  );
}

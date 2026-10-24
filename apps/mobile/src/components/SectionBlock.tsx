import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import {
  useAsyncDispatch,
  useAsyncSelector,
} from "@will-be-done/hyperdb/react";
import {
  createTaskInSection,
  deleteProjectSections,
  doneProjectSectionItemsForDisplay,
  moveLeft,
  moveRight,
  projectSectionByIdOrDefault,
  projectSectionItemsForDisplayChildren,
  updateProjectSection,
} from "@will-be-done/slices/space";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react-native";
import { TaskCard } from "./TaskCard";
import { Text } from "./Text";
import { promptDialog } from "./overlays";

const iconColor = "#cbd5e1";

// Mobile counterpart of the web ProjectTaskPanel section.
export function SectionBlock({
  projectSectionId,
  editingId,
  onEditingIdChange,
}: {
  projectSectionId: string;
  editingId: string | null;
  onEditingIdChange: (id: string | null) => void;
}) {
  const dispatch = useAsyncDispatch();
  const [isShowMore, setIsShowMore] = useState(false);

  const { data: section } = useAsyncSelector({
    selector: projectSectionByIdOrDefault,
    args: { id: projectSectionId },
  });
  const { data: items = [] } = useAsyncSelector({
    selector: projectSectionItemsForDisplayChildren,
    args: { projectSectionId },
  });
  const { data: doneItems = [] } = useAsyncSelector({
    selector: doneProjectSectionItemsForDisplay,
    args: { projectSectionId, limited: !isShowMore },
  });

  if (!section) return null;

  const visibleDoneItems = isShowMore ? doneItems : doneItems.slice(0, 3);

  const handleRename = async () => {
    const title = await promptDialog("Section name", section.title);
    if (title == null || title === "") return;
    await dispatch(
      updateProjectSection({ projectSectionId, section: { title } }),
    );
  };

  const handleDelete = () =>
    Alert.alert("Delete section", `Delete section "${section.title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          void dispatch(deleteProjectSections({ ids: [projectSectionId] })),
      },
    ]);

  const handleAddTask = async () => {
    const task = await dispatch(
      createTaskInSection({ projectSectionId, position: "prepend" }),
    );
    onEditingIdChange(task.id);
  };

  const renderCard = (display: (typeof items)[number]) => (
    <TaskCard
      key={display.listItem.id}
      display={display}
      isEditing={editingId === display.item.id}
      onEditingChange={(editing) =>
        onEditingIdChange(editing ? display.item.id : null)
      }
    />
  );

  return (
    <View className="mb-5">
      <View className="mb-2 flex-row items-center gap-1 px-1">
        <Pressable
          className="flex-1 py-0.5"
          onPress={() => void handleRename()}
        >
          <Text
            numberOfLines={1}
            className="text-xs uppercase font-inter-semibold text-subheader"
          >
            {section.title || "Untitled"}
          </Text>
        </Pressable>
        <View className="flex-row items-center gap-3">
          <IconButton
            label="Move up"
            onPress={() => void dispatch(moveLeft({ projectSectionId }))}
          >
            <ArrowUp size={12} color={iconColor} strokeWidth={2.5} />
          </IconButton>
          <IconButton
            label="Move down"
            onPress={() => void dispatch(moveRight({ projectSectionId }))}
          >
            <ArrowDown size={12} color={iconColor} strokeWidth={2.5} />
          </IconButton>
          <IconButton label="Delete section" onPress={handleDelete}>
            <Trash2 size={12} color={iconColor} strokeWidth={2.5} />
          </IconButton>
        </View>
      </View>

      <Pressable
        onPress={() => void handleAddTask()}
        className="mb-2 flex-row items-center justify-center gap-2 py-1.5"
      >
        <View className="size-4 items-center justify-center rounded-full border border-content-tinted/60 opacity-60">
          <Plus size={9} color={iconColor} strokeWidth={2.5} />
        </View>
        <Text className="text-sm text-content-tinted/60">Add task</Text>
      </Pressable>

      <View className="gap-2">
        {items.map(renderCard)}
        {visibleDoneItems.map(renderCard)}
        {!isShowMore && doneItems.length > 3 && (
          <Pressable onPress={() => setIsShowMore(true)} className="px-1">
            <Text className="text-sm text-subheader">
              Show more ({doneItems.length - 3})
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function IconButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      className="size-5 items-center justify-center rounded active:opacity-60"
    >
      {children}
    </Pressable>
  );
}

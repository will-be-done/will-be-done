import { useState } from "react";
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import {
  useAsyncDispatch,
  useAsyncSelector,
} from "@will-be-done/hyperdb/react";
import {
  createProjectSection,
  inboxProjectId,
  projectByIdOrDefault,
  projectSectionsByProjectId,
} from "@will-be-done/slices/space";
import { ChevronLeft, Plus } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { SectionBlock } from "@/components/SectionBlock";
import { SyncIndicator } from "@/components/SyncIndicator";
import { Text } from "@/components/Text";
import { promptDialog } from "@/components/overlays";

// The inbox project, laid out like the web project view on a small screen.
export default function InboxScreen() {
  const router = useRouter();
  const dispatch = useAsyncDispatch();
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: projectId = "" } = useAsyncSelector({
    selector: inboxProjectId,
    args: {},
  });
  const { data: project } = useAsyncSelector({
    selector: projectByIdOrDefault,
    args: { id: projectId },
  });
  const { data: sections = [] } = useAsyncSelector({
    selector: projectSectionsByProjectId,
    args: { projectId },
  });

  const openSpaces = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/spaces");
  };

  const handleAddSection = async () => {
    const title = await promptDialog("Section name");
    if (!title) return;
    await dispatch(
      createProjectSection({
        sectionDraft: { projectId, title },
        position: "append",
      }),
    );
  };

  return (
    <Screen>
      <KeyboardAvoidingView className="flex-1" behavior="padding">
        <View className="h-11 flex-row items-center justify-between px-2">
          <Pressable
            accessibilityLabel="Spaces"
            onPress={openSpaces}
            hitSlop={8}
            className="flex-row items-center rounded-md px-1 py-1 active:opacity-60"
          >
            <ChevronLeft size={20} color="#cbd5e1" />
            <Text className="text-[13px] text-content-tinted">Spaces</Text>
          </Pressable>
          <SyncIndicator />
        </View>

        <ScrollView
          contentContainerClassName="px-4 pb-8"
          keyboardShouldPersistTaps="handled"
        >
          {project && (
            <View className="mb-6 mt-2 flex-row items-start gap-3">
              <Text className="text-4xl leading-[44px]">
                {project.icon || "🟡"}
              </Text>
              <Text className="flex-1 text-3xl font-inter-bold leading-tight text-content">
                {project.title}
              </Text>
            </View>
          )}

          <View className="gap-1">
            {sections.map((section) => (
              <SectionBlock
                key={section.id}
                projectSectionId={section.id}
                editingId={editingId}
                onEditingIdChange={setEditingId}
              />
            ))}
            <Pressable
              onPress={() => void handleAddSection()}
              className="mt-1 flex-row items-center justify-center gap-2 py-1.5"
            >
              <View className="size-4 items-center justify-center rounded border border-content-tinted/50 opacity-50">
                <Plus size={9} color="#cbd5e1" strokeWidth={2.5} />
              </View>
              <Text className="text-sm text-content-tinted/50">
                Add section
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

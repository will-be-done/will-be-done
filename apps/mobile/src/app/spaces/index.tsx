import { Alert, Pressable, ScrollView, View } from "react-native";
import { Redirect, useRouter } from "expo-router";
import type { SubscribableDB } from "@will-be-done/hyperdb";
import {
  DBProvider,
  useAsyncDispatch,
  useAsyncSelector,
} from "@will-be-done/hyperdb/react";
import {
  createSpace,
  deleteSpace,
  listSpaces,
  updateSpace,
} from "@will-be-done/slices/user";
import { userDBConfig } from "@will-be-done/client/sync";
import {
  ChevronRight,
  CircleUserRound,
  FolderOpen,
  LogOut,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { AppLogo } from "@/components/AppLogo";
import { LoadingScreen } from "@/components/LoadingScreen";
import { Text } from "@/components/Text";
import { promptDialog, showActionSheet } from "@/components/overlays";
import { useDbStore } from "@/db/useDbStore";
import { authUtils, useAuthSnapshot } from "@/lib/auth";

const blueGlow = { boxShadow: "0 10px 15px -3px rgba(59, 130, 246, 0.25)" };

export default function SpacesRoute() {
  useAuthSnapshot();
  const userId = authUtils.getUserId();
  const store = useDbStore(
    userId && authUtils.isAuthenticated() ? userDBConfig(userId) : null,
  );

  if (!userId || !authUtils.isAuthenticated())
    return <Redirect href="/login" />;
  if (!store?.db) return <LoadingScreen error={store?.error} />;

  return (
    <DBProvider value={store.db as SubscribableDB}>
      <SpacesScreen />
    </DBProvider>
  );
}

function SpacesScreen() {
  const router = useRouter();
  const dispatch = useAsyncDispatch();
  const { data: spaces = [] } = useAsyncSelector({
    selector: listSpaces,
    args: {},
  });

  const handleCreateSpace = async () => {
    const name = await promptDialog("Enter space name:");
    if (!name?.trim()) return;
    await dispatch(createSpace({ name }));
  };

  const handleRenameSpace = async (id: string, currentName: string) => {
    const name = await promptDialog("Enter new space name:", currentName);
    if (name?.trim() && name !== currentName) {
      await dispatch(updateSpace({ id, name }));
    }
  };

  const handleDeleteSpace = (id: string, name: string) => {
    Alert.alert(
      "Delete space",
      `Are you sure you want to delete space "${name}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void dispatch(deleteSpace({ id })),
        },
      ],
    );
  };

  const openAccountMenu = () =>
    showActionSheet({
      actions: [
        {
          label: "Log out",
          icon: LogOut,
          onPress: () => {
            authUtils.signOut();
            router.replace("/login");
          },
        },
      ],
    });

  return (
    <Screen>
      <ScrollView contentContainerClassName="px-4 py-8">
        <View className="mb-8 gap-5">
          <View className="flex-row items-center gap-3">
            <AppLogo size={36} />
            <View className="flex-1">
              <Text className="text-2xl font-inter-bold tracking-tight text-white">
                Your Spaces
              </Text>
              <Text className="text-[13px] text-slate-400">
                Select a space to continue or create a new one
              </Text>
            </View>
          </View>
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={() => void handleCreateSpace()}
              className="min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2.5 active:bg-blue-400"
              style={blueGlow}
            >
              <Plus size={16} color="#fff" />
              <Text className="text-[13px] font-inter-semibold text-white">
                New Space
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Account menu"
              onPress={openAccountMenu}
              className="h-11 w-11 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.05] active:bg-white/[0.08]"
            >
              <CircleUserRound size={20} color="#cbd5e1" />
            </Pressable>
          </View>
        </View>

        {spaces.length > 0 ? (
          <View className="gap-4">
            {spaces.map((space) => (
              <Pressable
                key={space.id}
                onPress={() =>
                  router.push({
                    pathname: "/spaces/[spaceId]",
                    params: { spaceId: space.id },
                  })
                }
                onLongPress={() =>
                  showActionSheet({
                    title: space.name,
                    actions: [
                      {
                        label: "Rename",
                        icon: Pencil,
                        onPress: () =>
                          void handleRenameSpace(space.id, space.name),
                      },
                      {
                        label: "Delete",
                        icon: Trash2,
                        destructive: true,
                        onPress: () => handleDeleteSpace(space.id, space.name),
                      },
                    ],
                  })
                }
                className="flex-row items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.03] p-5 active:bg-white/[0.05]"
              >
                <Text className="flex-1 text-[15px] font-inter-medium text-white">
                  {space.name}
                </Text>
                <ChevronRight size={20} color="#475569" strokeWidth={1.5} />
              </Pressable>
            ))}
          </View>
        ) : (
          <View className="items-center justify-center rounded-lg border border-white/[0.04] bg-white/[0.02] px-6 py-16">
            <View className="mb-4 h-14 w-14 items-center justify-center rounded-full bg-blue-500/10">
              <FolderOpen size={28} color="#60a5fa" strokeWidth={1.5} />
            </View>
            <Text className="mb-2 text-lg font-inter-medium text-white">
              No spaces yet
            </Text>
            <Text className="mb-6 text-center text-[14px] text-slate-400">
              Create your first space to start organizing your tasks
            </Text>
            <Pressable
              onPress={() => void handleCreateSpace()}
              className="flex-row items-center gap-2 rounded-lg bg-blue-500 px-5 py-2.5 active:bg-blue-400"
              style={blueGlow}
            >
              <Plus size={16} color="#fff" />
              <Text className="text-[14px] font-inter-semibold text-white">
                Create your first space
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

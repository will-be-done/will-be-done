import { ActivityIndicator, View } from "react-native";
import { Screen } from "./Screen";
import { Text } from "./Text";

export function LoadingScreen({ error }: { error?: unknown }) {
  return (
    <Screen>
      <View className="flex-1 items-center justify-center gap-3 px-6">
        {error ? (
          <Text className="text-center text-sm text-red-400">
            {error instanceof Error ? error.message : "Failed to open data"}
          </Text>
        ) : (
          <ActivityIndicator color="#60a5fa" />
        )}
      </View>
    </Screen>
  );
}

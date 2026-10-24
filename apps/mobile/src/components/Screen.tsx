import type { ReactNode } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BackgroundOrbs } from "./BackgroundOrbs";

// The web StandalonePage: near-black surface with soft gradient orbs.
export function Screen({ children }: { children: ReactNode }) {
  return (
    <View className="flex-1 bg-surface">
      <BackgroundOrbs />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        {children}
      </SafeAreaView>
    </View>
  );
}

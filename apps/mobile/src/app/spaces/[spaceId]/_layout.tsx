import { useEffect } from "react";
import { Redirect, Slot, useLocalSearchParams } from "expo-router";
import type { SubscribableDB } from "@will-be-done/hyperdb";
import { DBProvider } from "@will-be-done/hyperdb/react";
import { spaceDBConfig } from "@will-be-done/client/sync";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useDbStore } from "@/db/useDbStore";
import { authUtils, useAuthSnapshot } from "@/lib/auth";

export default function SpaceLayout() {
  useAuthSnapshot();
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const isAuthenticated = authUtils.isAuthenticated();
  const store = useDbStore(isAuthenticated ? spaceDBConfig(spaceId) : null);

  useEffect(() => {
    if (isAuthenticated) authUtils.setLastUsedSpaceId(spaceId);
  }, [isAuthenticated, spaceId]);

  if (!isAuthenticated) return <Redirect href="/login" />;
  if (!store?.db) return <LoadingScreen error={store?.error} />;

  return (
    <DBProvider value={store.db as SubscribableDB}>
      <Slot />
    </DBProvider>
  );
}

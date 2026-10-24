import { Redirect } from "expo-router";
import { authUtils, useAuthSnapshot } from "@/lib/auth";

// Same entry rules as the web root route.
export default function Index() {
  useAuthSnapshot();

  if (!authUtils.isAuthenticated()) return <Redirect href="/login" />;

  const spaceId = authUtils.getLastUsedSpaceId();
  if (spaceId) {
    return (
      <Redirect href={{ pathname: "/spaces/[spaceId]", params: { spaceId } }} />
    );
  }

  return <Redirect href="/spaces" />;
}

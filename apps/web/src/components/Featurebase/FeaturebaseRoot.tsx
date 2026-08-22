import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { FeaturebaseProvider } from "featurebase-js/react";
import { authUtils } from "@/lib/auth";
import { trpcClient } from "@/lib/trpc";
import { isFeaturebaseHostname } from "./featurebaseHostname";

const FEATUREBASE_APP_ID = "6a89c98ba746c43bcaf1774b";

export function FeaturebaseRoot({ children }: { children: ReactNode }) {
  if (!isFeaturebaseHostname(window.location.hostname)) {
    return children;
  }

  return <IdentifiedFeaturebaseRoot>{children}</IdentifiedFeaturebaseRoot>;
}

function IdentifiedFeaturebaseRoot({ children }: { children: ReactNode }) {
  const authSnapshot = useSyncExternalStore(
    authUtils.subscribe,
    authUtils.getSnapshot,
  );
  const [identity, setIdentity] = useState<{
    authSnapshot: string;
    featurebaseJwt?: string;
  }>({ authSnapshot: "" });

  useEffect(() => {
    let active = true;

    if (!authUtils.isAuthenticated()) {
      return;
    }

    void trpcClient.getFeaturebaseIdentity
      .query()
      .then((identity) => {
        if (active) {
          setIdentity({
            authSnapshot,
            featurebaseJwt: identity.featurebaseJwt ?? undefined,
          });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setIdentity({ authSnapshot });
          console.error("Could not identify the user to Featurebase:", error);
        }
      });

    return () => {
      active = false;
    };
  }, [authSnapshot]);

  const featurebaseJwt =
    identity.authSnapshot === authSnapshot
      ? identity.featurebaseJwt
      : undefined;

  return (
    <FeaturebaseProvider
      appId={FEATUREBASE_APP_ID}
      featurebaseJwt={featurebaseJwt}
    >
      {children}
    </FeaturebaseProvider>
  );
}

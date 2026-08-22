import { useEffect, useState, useSyncExternalStore } from "react";
import { authUtils } from "@/lib/auth";
import { trpcClient } from "@/lib/trpc";
import { isTawkHostname } from "./tawkHostname";

const TAWK_LOADED_EVENT = "tawk:loaded";

interface TawkApi {
  login: (
    attributes: Record<string, string>,
    callback: (error?: unknown) => void,
  ) => void;
  logout: (callback: (error?: unknown) => void) => void;
  setAttributes: (
    attributes: Record<string, string>,
    callback: (error?: unknown) => void,
  ) => void;
}

declare global {
  interface Window {
    Tawk_API?: Partial<TawkApi>;
  }
}

function reportTawkError(action: string) {
  return (error?: unknown) => {
    if (error) console.error(`Could not ${action} Tawk identity:`, error);
  };
}

function whenTawkIsReady(run: (api: TawkApi) => void): () => void {
  const runIfReady = () => {
    const api = window.Tawk_API;
    if (
      typeof api?.login === "function" &&
      typeof api.logout === "function" &&
      typeof api.setAttributes === "function"
    ) {
      run(api as TawkApi);
    }
  };

  if (
    typeof window.Tawk_API?.login === "function" &&
    typeof window.Tawk_API.logout === "function" &&
    typeof window.Tawk_API.setAttributes === "function"
  ) {
    runIfReady();
    return () => {};
  }

  window.addEventListener(TAWK_LOADED_EVENT, runIfReady, { once: true });
  return () => window.removeEventListener(TAWK_LOADED_EVENT, runIfReady);
}

export function TawkIdentity() {
  if (!isTawkHostname(window.location.hostname)) return null;

  return <IdentifiedTawkIdentity />;
}

function IdentifiedTawkIdentity() {
  const authSnapshot = useSyncExternalStore(
    authUtils.subscribe,
    authUtils.getSnapshot,
  );
  const [token, userId, spaceId] = authSnapshot.split("\0");
  const [identifiedUserId, setIdentifiedUserId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let stopWaitingForTawk = () => {};
    const clearIdentity = (api: TawkApi) => {
      api.logout((error?: unknown) => {
        if (error) {
          reportTawkError("clear")(error);
        } else if (active) {
          setIdentifiedUserId(null);
        }
      });
    };

    if (!token || !userId) {
      return whenTawkIsReady(clearIdentity);
    }

    void trpcClient.getTawkIdentity
      .query()
      .then((identity) => {
        if (!active) return;

        stopWaitingForTawk = whenTawkIsReady((api) => {
          if (!identity) {
            clearIdentity(api);
            return;
          }

          api.login(
            {
              userId: identity.userId,
              email: identity.email,
              hash: identity.hash,
            },
            (error?: unknown) => {
              if (error) {
                reportTawkError("set")(error);
              } else if (active) {
                setIdentifiedUserId(identity.userId);
              }
            },
          );
        });
      })
      .catch((error: unknown) => {
        if (!active) return;

        console.error("Could not load Tawk identity:", error);
        stopWaitingForTawk = whenTawkIsReady(clearIdentity);
      });

    return () => {
      active = false;
      stopWaitingForTawk();
    };
  }, [token, userId]);

  useEffect(() => {
    if (!spaceId || identifiedUserId !== userId) return;

    return whenTawkIsReady((api) => {
      api.setAttributes(
        { "space-id": spaceId },
        reportTawkError("set space on"),
      );
    });
  }, [identifiedUserId, spaceId, userId]);

  return null;
}

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { toast } from "sonner";
import { useRegisterSW } from "virtual:pwa-register/react";
import {
  getSyncUpdateRequired,
  subscribeSyncUpdateRequired,
} from "@will-be-done/client/sync";

const UPDATE_TOAST_ID = "pwa-update-available";
const REQUIRED_UPDATE_TOAST_ID = "pwa-update-required";
const UPDATE_TOAST_PREVIEW_ID = "pwa-update-available-preview";
const UPDATE_TOAST_PREVIEW_PARAM = "pwa-update-toast";
const UPDATE_CHECK_INTERVAL_MS = 30_000;
const shouldPreviewUpdateToastOnLoad =
  import.meta.env.DEV &&
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has(UPDATE_TOAST_PREVIEW_PARAM);

type ShowUpdateToastOptions = {
  id: string;
  onReload: () => void;
  onDismiss: () => void;
};

function isManualBrowserReload() {
  const [navigationEntry] = performance.getEntriesByType(
    "navigation",
  ) as PerformanceNavigationTiming[];

  if (navigationEntry) {
    return navigationEntry.type === "reload";
  }

  return false;
}

function shouldPreviewUpdateToast() {
  return shouldPreviewUpdateToastOnLoad;
}

function showUpdateToast({ id, onReload, onDismiss }: ShowUpdateToastOptions) {
  toast("New version available", {
    id,
    description: "Reload to start using the latest version.",
    duration: Infinity,
    action: {
      label: "Reload",
      onClick: onReload,
    },
    cancel: {
      label: "Dismiss",
      onClick: () => {
        onDismiss();
        toast.dismiss(id);
      },
    },
  });
}

export function PwaUpdateController() {
  const [registration, setRegistration] =
    useState<ServiceWorkerRegistration | null>(null);
  const [updateToastDismissed, setUpdateToastDismissed] = useState(false);
  const hasControllerRef = useRef(false);
  const controllerReloadingRef = useRef(false);
  const manualReloadActivationStartedRef = useRef(false);
  const syncUpdateRequired = useSyncExternalStore(
    subscribeSyncUpdateRequired,
    getSyncUpdateRequired,
    getSyncUpdateRequired,
  );

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW: (_swScriptUrl, serviceWorkerRegistration) => {
      setRegistration(serviceWorkerRegistration ?? null);
    },
    onRegisterError(error) {
      console.error("Service worker registration failed", error);
    },
  });

  const activateUpdateServiceWorker = useCallback(() => {
    void updateServiceWorker(true).catch((error) => {
      manualReloadActivationStartedRef.current = false;
      console.error("Service worker update activation failed", error);
    });
  }, [updateServiceWorker]);

  const activateRequiredUpdate = useCallback(() => {
    void (async () => {
      try {
        await registration?.update();
        if (registration?.waiting || needRefresh) {
          await updateServiceWorker(true);
          return;
        }
      } catch (error) {
        console.error("Required update check failed", error);
      }

      window.location.reload();
    })();
  }, [needRefresh, registration, updateServiceWorker]);

  useEffect(() => {
    if (!shouldPreviewUpdateToast()) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      showUpdateToast({
        id: UPDATE_TOAST_PREVIEW_ID,
        onReload: () => {
          toast.dismiss(UPDATE_TOAST_PREVIEW_ID);
        },
        onDismiss: () => {},
      });
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (!registration) {
      return;
    }

    const checkForUpdate = () => {
      void registration.update().catch((error) => {
        console.error("Service worker update check failed", error);
      });
    };

    checkForUpdate();
    const intervalId = window.setInterval(
      checkForUpdate,
      UPDATE_CHECK_INTERVAL_MS,
    );

    return () => {
      window.clearInterval(intervalId);
    };
  }, [registration]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    hasControllerRef.current = Boolean(navigator.serviceWorker.controller);

    const handleControllerChange = () => {
      if (!hasControllerRef.current) {
        hasControllerRef.current = true;
        return;
      }

      if (controllerReloadingRef.current) {
        return;
      }

      controllerReloadingRef.current = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      handleControllerChange,
    );

    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        handleControllerChange,
      );
    };
  }, []);

  useEffect(() => {
    if (
      !("serviceWorker" in navigator) ||
      !registration?.waiting ||
      !navigator.serviceWorker.controller ||
      !isManualBrowserReload() ||
      manualReloadActivationStartedRef.current
    ) {
      return;
    }

    manualReloadActivationStartedRef.current = true;
    activateUpdateServiceWorker();
  }, [needRefresh, registration, activateUpdateServiceWorker]);

  useEffect(() => {
    if (
      !needRefresh ||
      syncUpdateRequired ||
      updateToastDismissed ||
      manualReloadActivationStartedRef.current
    ) {
      toast.dismiss(UPDATE_TOAST_ID);
      return;
    }

    showUpdateToast({
      id: UPDATE_TOAST_ID,
      onReload: () => {
        setUpdateToastDismissed(true);
        activateUpdateServiceWorker();
      },
      onDismiss: () => {
        setUpdateToastDismissed(true);
      },
    });
  }, [
    activateUpdateServiceWorker,
    needRefresh,
    syncUpdateRequired,
    updateToastDismissed,
  ]);

  useEffect(() => {
    if (!syncUpdateRequired) {
      toast.dismiss(REQUIRED_UPDATE_TOAST_ID);
      return;
    }

    toast.dismiss(UPDATE_TOAST_ID);
    toast("Update required", {
      id: REQUIRED_UPDATE_TOAST_ID,
      description: "Update Will Be Done to resume synchronization.",
      duration: Infinity,
      dismissible: false,
      action: {
        label: "Update",
        onClick: activateRequiredUpdate,
      },
    });
  }, [activateRequiredUpdate, syncUpdateRequired]);

  return null;
}

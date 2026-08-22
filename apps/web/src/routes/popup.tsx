import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { getPopupSpaceId, initPopupStore } from "@/store/popupStore";

export const Route = createFileRoute("/popup")({
  component: PopupComponent,
});

function PopupComponent() {
  const [title, setTitle] = useState("");
  const [spaceId, setSpaceId] = useState<string | null>(() =>
    getPopupSpaceId(),
  );
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >(spaceId ? "loading" : "error");
  const [errorMsg, setErrorMsg] = useState(
    spaceId ? "" : "No space selected. Open the main app first.",
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const storeRef = useRef<Awaited<ReturnType<typeof initPopupStore>> | null>(
    null,
  );
  const initializedSpaceIdRef = useRef<string | null>(null);
  const focusInput = useCallback(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);

  useEffect(() => {
    if (!spaceId || initializedSpaceIdRef.current === spaceId) return;

    initPopupStore(spaceId)
      .then((store) => {
        initializedSpaceIdRef.current = spaceId;
        storeRef.current = store;
        setStatus("idle");
      })
      .catch((err) => {
        console.error("Failed to init popup store:", err);
        initializedSpaceIdRef.current = null;
        storeRef.current = null;
        setStatus("error");
        setErrorMsg("Failed to initialize. Try again.");
      });
  }, [spaceId]);

  // Listen for popup-show IPC to reset state when the window is re-shown
  useEffect(() => {
    const cleanup = window.desktopApi?.onPopupShow(() => {
      const nextSpaceId = getPopupSpaceId();
      setSpaceId(nextSpaceId);
      setTitle("");

      if (!nextSpaceId) {
        initializedSpaceIdRef.current = null;
        storeRef.current = null;
        setStatus("error");
        setErrorMsg("No space selected. Open the main app first.");
      } else if (initializedSpaceIdRef.current !== nextSpaceId) {
        storeRef.current = null;
        setStatus("loading");
        setErrorMsg("");
      } else {
        setStatus("idle");
        setErrorMsg("");
      }

      // Re-showing the popup can happen after the route already mounted.
      focusInput();
    });
    return () => cleanup?.();
  }, [focusInput]);

  useEffect(() => {
    focusInput();
  }, [focusInput]);

  useEffect(() => {
    if (status !== "loading" && status !== "success") {
      focusInput();
    }
  }, [focusInput, status]);

  useEffect(() => {
    window.addEventListener("focus", focusInput);
    return () => window.removeEventListener("focus", focusInput);
  }, [focusInput]);

  const hidePopup = useCallback(() => {
    if (window.desktopApi?.closePopup) {
      window.desktopApi.closePopup();
    } else {
      window.close();
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = title.trim();
    if (!trimmed || !storeRef.current) return;

    setStatus("loading");
    try {
      hidePopup();
      await storeRef.current.createInboxTask(trimmed);
    } catch (err) {
      console.error("Failed to create task:", err);
      setStatus("error");
      setErrorMsg("Failed to create task.");
      setTimeout(() => setStatus("idle"), 2000);
    }

    setTitle("");
  }, [title, hidePopup]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        hidePopup();
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSubmit();
      }
    },
    [hidePopup, handleSubmit],
  );

  return (
    <div
      data-testid="popup"
      data-status={status}
      className="flex h-screen w-screen flex-col justify-center bg-surface p-4"
      style={{ fontFamily: '"DM Sans", sans-serif' }}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-accent/20">
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              className="text-accent"
            >
              <path
                d="M7 1v12M1 7h12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <span className="text-sm font-medium text-content-secondary">
            Add to Inbox
          </span>
        </div>

        <input
          ref={inputRef}
          aria-label="Task title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What needs to be done?"
          className="w-full rounded-lg border border-border bg-panel px-3 py-2.5 text-sm text-content placeholder:text-content-tinted-2 outline-none transition-colors focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
          autoComplete="off"
          spellCheck={false}
        />

        <div className="flex items-center justify-between">
          {status === "error" ? (
            <span className="text-xs text-red-400">{errorMsg}</span>
          ) : (
            <span className="text-xs text-content-tinted-2">
              Press{" "}
              <kbd className="rounded bg-overlay px-1 py-0.5 text-content-secondary">
                Enter
              </kbd>{" "}
              to add
            </span>
          )}
          <span className="text-xs text-content-tinted-2">
            <kbd className="rounded bg-overlay px-1 py-0.5 text-content-secondary">
              Esc
            </kbd>{" "}
            to close
          </span>
        </div>
      </div>
    </div>
  );
}

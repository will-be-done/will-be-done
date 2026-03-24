import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { getPopupSpaceId, initPopupStore } from "@/store/popupStore";

export const Route = createFileRoute("/popup")({
  component: PopupComponent,
});

function PopupComponent() {
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const storeRef = useRef<Awaited<
    ReturnType<typeof initPopupStore>
  > | null>(null);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const spaceId = getPopupSpaceId();
    if (!spaceId) {
      setStatus("error");
      setErrorMsg("No space selected. Open the main app first.");
      return;
    }

    initPopupStore(spaceId)
      .then((store) => {
        storeRef.current = store;
      })
      .catch((err) => {
        console.error("Failed to init popup store:", err);
        setStatus("error");
        setErrorMsg("Failed to initialize. Try again.");
      });
  }, []);

  // Listen for popup-show IPC to reset state when the window is re-shown
  useEffect(() => {
    const cleanup = window.desktopApi?.onPopupShow(() => {
      setTitle("");
      setStatus("idle");
      setErrorMsg("");
      // Focus input on next frame after the window becomes visible
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    });
    return () => cleanup?.();
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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
      className="flex h-screen w-screen flex-col justify-center bg-surface p-4"
      style={{ fontFamily: "InterVariable, sans-serif" }}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-blue-500/20">
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              className="text-blue-400"
            >
              <path
                d="M7 1v12M1 7h12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <span className="text-sm font-medium text-slate-400">
            Add to Inbox
          </span>
        </div>

        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What needs to be done?"
          disabled={status === "loading" || status === "success"}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition-colors focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 disabled:opacity-50"
          autoComplete="off"
          spellCheck={false}
        />

        <div className="flex items-center justify-between">
          {status === "error" ? (
            <span className="text-xs text-red-400">{errorMsg}</span>
          ) : (
            <span className="text-xs text-slate-600">
              Press{" "}
              <kbd className="rounded bg-white/10 px-1 py-0.5 text-slate-400">
                Enter
              </kbd>{" "}
              to add
            </span>
          )}
          <span className="text-xs text-slate-600">
            <kbd className="rounded bg-white/10 px-1 py-0.5 text-slate-400">
              Esc
            </kbd>{" "}
            to close
          </span>
        </div>
      </div>
    </div>
  );
}

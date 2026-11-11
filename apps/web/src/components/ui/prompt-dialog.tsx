import { useState, useEffect, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useFocusStore } from "@/store/focusSlice";
import { usePrevious } from "@/utils";
import {
  mountPromptDialog,
  type PromptRequest,
} from "@/components/ui/prompt-dialog-service";

/**
 * Mount this once at the app root (e.g. in __root.tsx) so that
 * `promptDialog()` and `confirmDialog()` can render a modal anywhere.
 */
export function PromptDialogHost() {
  const [request, setRequest] = useState<PromptRequest | null>(null);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const isOpen = request !== null;

  useEffect(() => {
    return mountPromptDialog(setRequest);
  }, []);

  // Keeps Escape from also clearing the selection behind the dialog.
  useEffect(() => {
    if (!isOpen) return;
    useFocusStore.getState().disableFocus();
    return () => useFocusStore.getState().enableFocus();
  }, [isOpen]);

  // Keep a snapshot so the text doesn't disappear during close animation
  const prevRequest = usePrevious(request);
  const shown = request ?? prevRequest;

  const handleConfirm = useCallback(() => {
    if (request?.kind === "prompt") request.resolve(value);
    else request?.resolve(true);
    setValue("");
    setRequest(null);
  }, [request, value]);

  const handleCancel = useCallback(() => {
    if (request?.kind === "prompt") request.resolve(null);
    else request?.resolve(false);
    setValue("");
    setRequest(null);
  }, [request]);

  const isConfirm = shown?.kind === "confirm";

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleCancel();
      }}
    >
      <DialogContent
        className="bg-popover backdrop-blur-xl ring-1 ring-ring border-none sm:max-w-sm gap-5 [&>button]:text-content-tinted"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          if (request?.kind === "confirm") {
            confirmRef.current?.focus();
            return;
          }
          setValue(request?.defaultValue ?? "");
          requestAnimationFrame(() => inputRef.current?.select());
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold text-content">
            {shown?.title ?? ""}
          </DialogTitle>
          {shown?.kind === "confirm" && shown.description ? (
            <DialogDescription className="text-[13px] text-content-tinted">
              {shown.description}
            </DialogDescription>
          ) : (
            <DialogDescription className="sr-only">
              {isConfirm
                ? "Confirm or cancel."
                : "Enter a value and press confirm or cancel."}
            </DialogDescription>
          )}
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleConfirm();
          }}
        >
          {!isConfirm && (
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full rounded-md border border-ring bg-surface px-3 py-2 text-sm text-content placeholder:text-content-tinted/50 outline-none transition-shadow focus:ring-2 focus:ring-accent/40 focus:border-accent/60"
              autoComplete="off"
            />
          )}

          <DialogFooter className={cn(!isConfirm && "mt-4")}>
            <button
              type="button"
              onClick={handleCancel}
              className="cursor-pointer rounded-md px-3.5 py-1.5 text-[13px] font-medium text-content-tinted transition-colors hover:text-content hover:bg-white/[0.05]"
            >
              Cancel
            </button>
            <button
              ref={confirmRef}
              type="submit"
              className={cn(
                "cursor-pointer rounded-md px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/40",
                isConfirm
                  ? "bg-red-600 hover:bg-red-600/85"
                  : "bg-accent hover:bg-accent/85",
              )}
            >
              {shown?.kind === "confirm" ? shown.confirmLabel : "Confirm"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";

type PromptRequest = {
  title: string;
  defaultValue?: string;
  resolve: (value: string | null) => void;
};

let mountedSetter: ((req: PromptRequest | null) => void) | null = null;

/**
 * Imperative prompt dialog — drop-in replacement for `window.prompt()`.
 *
 * Returns the entered string, or `null` if the user cancelled.
 */
export function promptDialog(
  title: string,
  defaultValue?: string,
): Promise<string | null> {
  return new Promise((resolve) => {
    if (!mountedSetter) {
      resolve(window.prompt(title, defaultValue));
      return;
    }
    mountedSetter({ title, defaultValue, resolve });
  });
}

/**
 * Mount this once at the app root (e.g. in __root.tsx) so that `promptDialog()`
 * can render a modal anywhere in the app.
 */
export function PromptDialogHost() {
  const [request, setRequest] = useState<PromptRequest | null>(null);
  const [value, setValue] = useState("");
  // Keep a snapshot of the title so it doesn't disappear during close animation
  const [displayTitle, setDisplayTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    mountedSetter = setRequest;
    return () => {
      mountedSetter = null;
    };
  }, []);

  useEffect(() => {
    if (request) {
      setValue(request.defaultValue ?? "");
      setDisplayTitle(request.title);
    }
  }, [request]);

  const handleConfirm = useCallback(() => {
    request?.resolve(value);
    setRequest(null);
  }, [request, value]);

  const handleCancel = useCallback(() => {
    request?.resolve(null);
    setRequest(null);
  }, [request]);

  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) handleCancel();
      }}
    >
      <DialogContent
        className="bg-popover backdrop-blur-xl ring-1 ring-ring border-none sm:max-w-sm gap-5 [&>button]:text-content-tinted"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          requestAnimationFrame(() => inputRef.current?.select());
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold text-content">
            {displayTitle}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Enter a value and press confirm or cancel.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleConfirm();
          }}
        >
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-md border border-ring bg-surface px-3 py-2 text-sm text-content placeholder:text-content-tinted/50 outline-none transition-shadow focus:ring-2 focus:ring-accent/40 focus:border-accent/60"
            autoComplete="off"
          />

          <DialogFooter className="mt-4">
            <button
              type="button"
              onClick={handleCancel}
              className="cursor-pointer rounded-md px-3.5 py-1.5 text-[13px] font-medium text-content-tinted transition-colors hover:text-content hover:bg-white/[0.05]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="cursor-pointer rounded-md bg-accent px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-accent/85"
            >
              Confirm
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

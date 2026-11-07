"use client";

import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import "sonner/dist/styles.css";

function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      gap={10}
      expand={false}
      style={{ "--width": "356px" } as CSSProperties}
      offset={{
        right: "max(16px, env(safe-area-inset-right))",
        bottom: "var(--update-toast-bottom-offset)",
      }}
      mobileOffset={{
        left: "12px",
        right: "12px",
        bottom: "var(--update-toast-mobile-bottom-offset)",
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          // Horizontal layout via grid: text takes the flexible 1fr column on
          // the left (spanning both rows), the two narrow buttons stack in the
          // auto column on the right — Reload on top, Dismiss below.
          toast:
            "group toast grid w-[var(--width)] grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 rounded-[10px] border border-update-toast-border bg-update-toast-surface p-4 text-[13px] text-update-toast-title shadow-update-toast backdrop-blur-xl",
          content: "col-start-1 row-span-2 flex min-w-0 flex-col gap-1",
          title:
            "text-[13px] leading-5 font-semibold tracking-[-0.01em] text-update-toast-title",
          description: "text-[12.5px] leading-5 text-update-toast-description",
          actionButton:
            "col-start-2 row-start-1 inline-flex h-8 w-[88px] cursor-pointer items-center justify-center rounded-lg border-0 bg-update-toast-action px-3 text-[13px] font-semibold text-update-toast-action-content shadow-[0_4px_20px_var(--color-update-toast-action-glow)] transition-[background-color,box-shadow,transform] duration-150 hover:bg-update-toast-action-hover hover:shadow-[0_4px_24px_var(--color-update-toast-action-glow)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-update-toast-action/50",
          cancelButton:
            "col-start-2 row-start-2 inline-flex h-8 w-[88px] cursor-pointer items-center justify-center rounded-lg border border-update-toast-border bg-update-toast-cancel px-3 text-[13px] font-medium text-update-toast-description transition-[background-color,color,transform] duration-150 hover:bg-update-toast-cancel-hover hover:text-update-toast-title active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-update-toast-action/40",
          closeButton:
            "border-update-toast-border bg-update-toast-surface text-update-toast-description hover:text-update-toast-title",
        },
      }}
      {...props}
    />
  );
}

/**
 * A line along the toast's top edge that runs out with its duration. Sonner
 * pauses the timer while the toasts are hovered, so the line pauses too.
 */
function ToastCountdown({ duration }: { duration: number }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-x-[10px] top-0 h-0.5 origin-left animate-toast-countdown rounded-full bg-update-toast-action/70 group-data-[expanded=true]:[animation-play-state:paused]"
      style={{ animationDuration: `${duration}ms` }}
    />
  );
}

export { Toaster, ToastCountdown };

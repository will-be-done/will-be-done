import type { ReactNode } from "react";
import type { Project } from "@will-be-done/slices/space";
import { cn } from "@/lib/utils";

const edgeMask =
  "linear-gradient(to right, transparent, black 12px, black calc(100% - 12px), transparent), linear-gradient(to bottom, transparent, black 12px, black calc(100% - 12px), transparent)";

export function ProjectCardBody({
  project,
  children,
  className,
  fillImage = false,
}: {
  project?: Project;
  children: ReactNode;
  className?: string;
  fillImage?: boolean;
}) {
  const image = project?.backgroundImageUrl;
  return (
    <div className={cn("relative isolate overflow-hidden", className)}>
      {image && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
          style={{
            backgroundColor:
              project.cardBackgroundColor ?? "var(--color-panel)",
            WebkitMaskImage: edgeMask,
            WebkitMaskComposite: "source-in",
            maskImage: edgeMask,
            maskComposite: "intersect",
          }}
        >
          <img
            src={image}
            alt=""
            referrerPolicy="no-referrer"
            className={cn(
              "h-full w-full opacity-35 blur-[2px]",
              fillImage ? "object-cover" : "scale-95 object-contain",
            )}
          />
        </div>
      )}
      {children}
    </div>
  );
}

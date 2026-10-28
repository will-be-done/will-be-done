import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils.ts";
import { useFocusStore } from "@/store/focusSlice.ts";
import { isInputElement } from "@/utils/isInputElement.ts";
import { useGlobalListener } from "@/components/GlobalListener/hooks.tsx";
import { ResizableDivider } from "@/components/DaysBoard/ResizableDivider.tsx";
import { ProjectView } from "./ProvecjtView.tsx";
import { useProjectsViewSize } from "./ProjectsViewStore.ts";

// Page content on top, a resizable and hideable ProjectView below. P toggles
// the projects view.
export const ProjectsSplit = ({
  children,
  topClassName,
  projectLink,
  selectedProjectId,
  selectedDate,
}: {
  children: React.ReactNode;
  topClassName?: string;
  projectLink: React.ComponentProps<typeof ProjectView>["projectLink"];
  selectedProjectId: string;
  selectedDate: Date;
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const {
    projectsViewHeight,
    projectsViewHidden,
    setProjectsViewHeight,
    setProjectsViewHidden,
  } = useProjectsViewSize();

  const handleResize = useCallback(
    (clientY: number) => {
      const rootRect = rootRef.current?.getBoundingClientRect();
      if (!rootRect) return;

      const heightPercentage =
        ((rootRect.bottom - clientY) / rootRect.height) * 100;
      setProjectsViewHeight(Math.max(10, Math.min(80, heightPercentage)));
    },
    [setProjectsViewHeight],
  );

  useGlobalListener("keydown", (e: KeyboardEvent) => {
    const focusState = useFocusStore.getState();
    const noModifiers = !(e.shiftKey || e.ctrlKey || e.metaKey || e.altKey);

    if (
      !noModifiers ||
      focusState.isFocusDisabled ||
      !!focusState.editItemKey ||
      e.defaultPrevented
    ) {
      return;
    }

    const target =
      e.target instanceof Element ? e.target : document.activeElement;
    if (target && isInputElement(target)) return;

    if (e.code === "KeyP") {
      e.preventDefault();
      setProjectsViewHidden(!projectsViewHidden);
    }
  });

  const heightTransitionClass = isResizing
    ? "transition-none"
    : "transition-[height] duration-300 ease-out";

  return (
    <div ref={rootRef} className="flex h-full min-w-0 flex-1 flex-col">
      <div
        className={cn(topClassName, heightTransitionClass)}
        style={{
          height: projectsViewHidden ? "100%" : `${100 - projectsViewHeight}%`,
        }}
      >
        {children}
      </div>
      <div
        className={cn("w-full relative", heightTransitionClass)}
        style={{
          height: projectsViewHidden ? "0" : `${projectsViewHeight}%`,
        }}
      >
        <ResizableDivider
          onResizePosition={handleResize}
          onResizeStart={() => setIsResizing(true)}
          onResizeEnd={() => setIsResizing(false)}
          onHideClick={() => setProjectsViewHidden(!projectsViewHidden)}
          isHidden={projectsViewHidden}
        />

        <div className="absolute inset-0 overflow-hidden">
          <div
            aria-hidden={projectsViewHidden}
            className={cn(
              "h-full transition-transform duration-300 ease-out",
              projectsViewHidden
                ? "translate-y-6 pointer-events-none"
                : "translate-y-0",
            )}
          >
            <ProjectView
              selectedProjectId={selectedProjectId}
              projectLink={projectLink}
              selectedDate={selectedDate}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

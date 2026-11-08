import { useIsMobile } from "@/hooks/use-mobile.ts";
import { STASH_BUTTON_WIDTH } from "@/components/DaysBoard/StashStore.ts";
import { Stash } from "./Stash.tsx";
import { useStashDesktopOffset } from "./useStashDesktopOffset.ts";

// The stash at the content's left edge; when open it pushes the content
// aside. `reserveButton` keeps the closed toggle from covering the content.
export const WithStash = ({
  reserveButton = false,
  children,
}: {
  reserveButton?: boolean;
  children: React.ReactNode;
}) => {
  const isMobile = useIsMobile();
  const offset = useStashDesktopOffset();
  const inset = offset || (reserveButton && !isMobile ? STASH_BUTTON_WIDTH : 0);

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden">
      <Stash />
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col"
        style={{
          marginLeft: inset ? `${inset}px` : undefined,
          transition: "margin-left 200ms ease-out",
        }}
      >
        {children}
      </div>
    </div>
  );
};

import { Settings } from "lucide-react";
import { Route } from "@/routes/spaces.$spaceId.tsx";
import { authUtils, isDemoMode } from "@/lib/auth";
import { useSpaceSettingsStore } from "@/components/SpaceSettings/spaceSettingsStore.ts";
import { useSidebar } from "@/components/ui/sidebar.tsx";

export function SpaceBlock() {
  const { spaceId } = Route.useParams();
  const openSettings = useSpaceSettingsStore((s) => s.openSettings);
  const { isMobile, setOpenMobile } = useSidebar();

  const spaceName = isDemoMode()
    ? "Demo Space"
    : (authUtils.getSpaceName(spaceId) ?? spaceId);

  const handleClick = () => {
    if (isMobile) setOpenMobile(false);
    openSettings(spaceName);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="group/space w-full cursor-pointer flex items-center gap-3 px-4 py-3 border-t border-ring/40 bg-white/[0.02] transition-colors hover:bg-white/[0.04]"
    >
      {/* Space avatar */}
      <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-accent/15 ring-1 ring-accent/20">
        <span className="text-[10px] font-bold text-accent leading-none select-none">
          {spaceName.slice(0, 2).toUpperCase()}
        </span>
      </div>

      {/* Name */}
      <span className="flex-1 truncate text-left text-[12px] font-medium text-content-tinted group-hover/space:text-content transition-colors">
        {spaceName}
      </span>

      {/* Settings icon — always visible */}
      <Settings className="h-3.5 w-3.5 flex-shrink-0 text-content-tinted/40" />
    </button>
  );
}

import { Settings, ArrowLeftRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Route } from "@/routes/spaces.$spaceId.tsx";
import { authUtils, isDemoMode } from "@/lib/auth";
import { useSpaceSettingsStore } from "@/components/SpaceSettings/spaceSettingsStore.ts";
import { ThemeCycleButton } from "@/components/ui/theme-toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";

const iconButtonClass =
  "flex size-9 items-center justify-center rounded-lg text-content-tinted/70 transition-colors hover:bg-overlay hover:text-content";

export function SpaceBlock() {
  const { spaceId } = Route.useParams();
  const openSettings = useSpaceSettingsStore((s) => s.openSettings);

  const spaceName = isDemoMode()
    ? "Demo Space"
    : (authUtils.getSpaceName(spaceId) ?? spaceId);

  return (
    <div
      className="mt-auto flex flex-col items-center gap-1"
      role="group"
      aria-label="Space"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="flex size-9 items-center justify-center"
            aria-label={spaceName}
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/15 ring-1 ring-accent/20">
              <span className="text-[10px] font-bold leading-none text-accent select-none">
                {spaceName.slice(0, 2).toUpperCase()}
              </span>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {spaceName}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <ThemeCycleButton
            className={`${iconButtonClass} [&_svg]:size-[18px]`}
          />
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          Theme
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            to="/spaces"
            aria-label="Switch space"
            className={iconButtonClass}
          >
            <ArrowLeftRight className="size-[18px]" strokeWidth={1.6} />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          Switch space
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Space settings"
            onClick={() => openSettings(spaceName)}
            className={`${iconButtonClass} cursor-pointer`}
          >
            <Settings className="size-[18px]" strokeWidth={1.6} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          Settings
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Link,
  Outlet,
  useCanGoBack,
  useChildMatches,
  useRouter,
} from "@tanstack/react-router";
import {
  ArrowDownToLine,
  ArrowLeft,
  CalendarDays,
  HardDrive,
  KeyRound,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { GlobalLayout } from "@/components/Layout/GlobalLayout";
import { authUtils } from "@/lib/auth";
import { isDemoMode } from "@/lib/demoMode";
import { useTRPC } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Route } from "@/routes/spaces.$spaceId";

const SECTIONS = [
  {
    to: "/spaces/$spaceId/settings/general",
    label: "General",
    icon: SlidersHorizontal,
  },
  {
    to: "/spaces/$spaceId/settings/account",
    label: "Account",
    icon: UserRound,
  },
  {
    to: "/spaces/$spaceId/settings/calendars",
    label: "Calendars",
    icon: CalendarDays,
  },
  {
    to: "/spaces/$spaceId/settings/tokens",
    label: "API tokens",
    icon: KeyRound,
  },
  { to: "/spaces/$spaceId/settings/backup", label: "Backup", icon: HardDrive },
  {
    to: "/spaces/$spaceId/settings/import",
    label: "Import",
    icon: ArrowDownToLine,
  },
] as const;

export function SettingsLayout() {
  const { spaceId } = Route.useParams();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const childRouteId = useChildMatches({
    select: (matches) => matches[0]?.routeId,
  });
  const trpc = useTRPC();
  const authConfig = useQuery(
    trpc.getAuthConfig.queryOptions(undefined, { enabled: !isDemoMode() }),
  );
  const showAccount =
    !isDemoMode() &&
    (authConfig.data?.emailEnabled || authConfig.data?.googleEnabled);
  const sections = SECTIONS.filter(
    (section) =>
      (section.label !== "Account" || showAccount) &&
      // Calendars are fetched by the server, which demo mode does not have.
      (section.label !== "Calendars" || !isDemoMode()),
  );
  const current = SECTIONS.find((section) => section.to === childRouteId);
  const spaceName = isDemoMode()
    ? "Demo Space"
    : (authUtils.getSpaceName(spaceId) ?? spaceId);

  // Section links replace history, so going back leaves settings entirely.
  const leave = () => {
    if (canGoBack) {
      router.history.back();
    } else {
      void router.navigate({ to: "/spaces/$spaceId", params: { spaceId } });
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (
        e.target instanceof HTMLElement &&
        e.target.closest("input, textarea, select, [contenteditable]")
      ) {
        return;
      }
      leave();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const backLink = (className: string, label?: string) => (
    <Link
      to="/spaces/$spaceId"
      params={{ spaceId }}
      aria-label="Back"
      onClick={(e) => {
        e.preventDefault();
        leave();
      }}
      className={cn(
        "items-center gap-2.5 rounded-lg text-[14px] text-content-tinted/70 transition-colors hover:bg-white/[0.04] hover:text-content [app-region:no-drag]",
        className,
      )}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {label}
    </Link>
  );

  return (
    <GlobalLayout>
      <div className="flex h-full w-full flex-col sm:flex-row">
        <aside className="flex shrink-0 flex-col gap-4 border-b border-white/[0.06] bg-black/20 px-3 py-3 sm:w-60 sm:border-b-0 sm:border-r desktop-macos:pt-12">
          <div className="flex items-center gap-2.5 px-1 sm:px-2 sm:pt-2">
            {backLink("flex p-1.5 sm:hidden")}
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-accent/15 ring-1 ring-accent/20">
              <span className="select-none text-[10px] font-bold leading-none text-accent">
                {spaceName.slice(0, 2).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold leading-tight text-content">
                Settings
              </p>
              <p className="truncate text-[11px] leading-tight text-content-tinted/50">
                {spaceName}
              </p>
            </div>
          </div>

          <nav
            aria-label="Settings"
            className="flex flex-wrap gap-1 sm:flex-col sm:flex-nowrap"
          >
            {sections.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                params={{ spaceId }}
                replace
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] sm:gap-2.5 sm:px-3 sm:py-2 sm:text-[14px] text-content-tinted/70 transition-colors hover:bg-white/[0.04] hover:text-content data-[status=active]:bg-white/[0.07] data-[status=active]:text-content"
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </Link>
            ))}
          </nav>

          {backLink("mt-auto hidden px-3 py-2 sm:flex", "Back")}
        </aside>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 pt-6 pb-16 sm:px-8 sm:pt-10 desktop-macos:pt-12">
            <div className="flex items-baseline gap-2 text-[17px]">
              <span className="text-content-tinted/50" aria-hidden="true">
                Settings
              </span>
              <span className="text-content-tinted/30" aria-hidden="true">
                /
              </span>
              <h1 className="font-medium text-content">{current?.label}</h1>
            </div>
            <Outlet />
          </div>
        </main>
      </div>
    </GlobalLayout>
  );
}

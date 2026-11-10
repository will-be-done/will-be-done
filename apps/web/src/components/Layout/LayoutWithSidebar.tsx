import { useSidebarStore } from "@/store/sidebarStore.ts";
import { AppSidebar } from "@/components/Sidebar/AppSidebar.tsx";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar.tsx";

// The view switcher's four tabs need this much.
const WIDTH_WITH_MAPS_TAB = 272;

export const LayoutWithSidebar = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const storedWidth = useSidebarStore((s) => s.width);
  const sidebarWidth = Math.max(storedWidth, WIDTH_WITH_MAPS_TAB);
  const setSidebarWidth = useSidebarStore((s) => s.setWidth);

  return (
    <SidebarProvider
      defaultOpen={true}
      className="min-h-0 h-full w-full"
      width={sidebarWidth}
      onWidthChange={setSidebarWidth}
    >
      <AppSidebar />
      <SidebarInset className="min-h-0 bg-transparent">
        <div className="relative h-full">
          <SidebarTrigger className="absolute left-2 top-2 z-30 cursor-pointer text-content-tinted backdrop-blur-md hover:text-primary safari:backdrop-blur-none desktop-macos:data-[open=false]:ml-20 desktop-macos:top-2.5 [app-region:no-drag]" />
          {children}
          {/* {!isDemoMode() && ( */}
          {/*   <div className="absolute right-0 top-0"> */}
          {/*     <div className="flex items-center rounded-bl-lg text-[13px] bg-surface-elevated/70 backdrop-blur-md ring-1 ring-ring text-content-tinted h-8 px-3 gap-4"> */}
          {/*       <Link */}
          {/*         className="transition-colors hover:text-primary" */}
          {/*         to="/spaces" */}
          {/*       > */}
          {/*         spaces */}
          {/*       </Link> */}
          {/*     </div> */}
          {/*   </div> */}
          {/* )} */}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

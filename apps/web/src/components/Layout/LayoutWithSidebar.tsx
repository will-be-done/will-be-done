import { useSidebarStore } from "@/store/sidebarStore.ts";
import { AppSidebar } from "@/components/Sidebar/AppSidebar.tsx";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar.tsx";

export const LayoutWithSidebar = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const sidebarWidth = useSidebarStore((s) => s.width);
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
          <SidebarTrigger className="absolute left-2 top-2 z-30 cursor-pointer data-[open=true]:hidden safari:backdrop-blur-none desktop-macos:data-[open=false]:ml-20 desktop-macos:top-2.5 [app-region:no-drag]" />
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

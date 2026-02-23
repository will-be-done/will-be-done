import { useSidebarStore } from "@/store/sidebarStore.ts";
import { AppSidebar } from "@/components/Sidebar/AppSidebar.tsx";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar.tsx";
import { Link } from "@tanstack/react-router";
import { isDemoMode } from "@/lib/auth";

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
          <SidebarTrigger className="absolute left-2 top-2 z-20 text-content-tinted hover:text-primary backdrop-blur-md cursor-pointer" />
          {children}
          {!isDemoMode() && (
            <div className="absolute right-0 top-0">
              <div className="flex items-center rounded-bl-lg text-[13px] bg-surface-elevated/70 backdrop-blur-md ring-1 ring-ring text-content-tinted h-8 px-3 gap-4">
                <Link
                  className="transition-colors hover:text-primary"
                  to="/spaces"
                >
                  spaces
                </Link>
              </div>
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

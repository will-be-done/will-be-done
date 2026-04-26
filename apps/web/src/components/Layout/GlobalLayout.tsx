import { MobileTaskToolbar } from "@/components/Task/MobileTaskToolbar.tsx";
import { BackgroundOrbs } from "@/components/Layout/BackgroundOrbs.tsx";

export const GlobalLayout = ({ children }: { children?: React.ReactNode }) => {
  return (
    <div className="relative w-full h-screen bg-surface overflow-hidden flex antialiased">
      {/* Gradient orbs */}
      <BackgroundOrbs />

      {/* Noise texture overlay */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.015]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Content */}
      <div className="relative w-full h-full flex">{children}</div>

      <MobileTaskToolbar />
    </div>
  );
};

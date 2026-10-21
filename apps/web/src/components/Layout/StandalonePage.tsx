import type { ReactNode } from "react";
import { BackgroundOrbs } from "./BackgroundOrbs";

export function StandalonePage({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen bg-[#0a0a0f] text-slate-100 antialiased">
      <div className="absolute inset-x-0 top-0 z-50 h-10 [app-region:drag]" />
      <BackgroundOrbs />
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.015]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />
      <div className="relative px-4 py-8 sm:px-6">
        <main className="mx-auto max-w-5xl desktop-macos:mt-4">{children}</main>
      </div>
    </div>
  );
}

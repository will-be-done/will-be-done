import { cn } from "@/lib/utils";

type BackgroundOrbsProps = {
  className?: string;
  topOrbFill?: string;
  bottomOrbFill?: string;
};

export function BackgroundOrbs({
  className,
  topOrbFill = "var(--color-orb-blue)",
  bottomOrbFill = "var(--color-orb-indigo)",
}: BackgroundOrbsProps) {
  return (
    <div className={cn("pointer-events-none fixed inset-0 overflow-hidden", className)}>
      <svg
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="none"
        viewBox="0 0 1440 1024"
      >
        <defs>
          <filter
            id="background-orb-top-blur"
            x="-35%"
            y="-50%"
            width="170%"
            height="200%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur stdDeviation="60" />
          </filter>
          <filter
            id="background-orb-bottom-blur"
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur stdDeviation="50" />
          </filter>
        </defs>

        <ellipse
          cx="720"
          cy="0"
          rx="400"
          ry="400"
          fill={topOrbFill}
          filter="url(#background-orb-top-blur)"
        />
        <ellipse
          cx="1540"
          cy="1124"
          rx="300"
          ry="300"
          fill={bottomOrbFill}
          filter="url(#background-orb-bottom-blur)"
        />
      </svg>
    </div>
  );
}

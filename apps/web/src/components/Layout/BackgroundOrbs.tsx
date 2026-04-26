import { cn } from "@/lib/utils";

type BackgroundOrbsProps = {
  className?: string;
  topOrbFill?: string;
  bottomOrbFill?: string;
};

export function BackgroundOrbs({
  className,
  topOrbFill = "rgb(37 99 235 / 0.08)",
  bottomOrbFill = "rgb(99 102 241 / 0.06)",
}: BackgroundOrbsProps) {
  const isSafari =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("is-safari");

  if (isSafari) {
    return null;
  }

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-0 overflow-hidden",
        className,
      )}
    >
      <div
        className="absolute -top-[400px] left-1/2 h-[800px] w-[800px] -translate-x-1/2 rounded-full blur-[120px]"
        style={{ backgroundColor: topOrbFill }}
      />
      <div
        className="absolute -bottom-[200px] -right-[200px] h-[600px] w-[600px] rounded-full blur-[100px]"
        style={{ backgroundColor: bottomOrbFill }}
      />
    </div>
  );
}

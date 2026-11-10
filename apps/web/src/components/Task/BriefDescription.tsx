import { cn } from "@/lib/utils";

export function BriefDescription({
  text,
  maxLines = 4,
  className,
}: {
  text?: string;
  maxLines?: number;
  className?: string;
}) {
  if (!text?.trim()) return null;
  return (
    <p
      title={text}
      style={{ WebkitLineClamp: maxLines }}
      className={cn(
        "mt-1 line-clamp-4 whitespace-pre-wrap text-[11px] font-normal leading-[14px] text-content-tinted [overflow-wrap:anywhere]",
        className,
      )}
    >
      {text}
    </p>
  );
}

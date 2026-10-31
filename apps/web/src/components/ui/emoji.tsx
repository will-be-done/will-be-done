import { useState } from "react";

import { cn } from "@/lib/utils";

// Files in public/emoji are named by codepoint with FE0F dropped, as in Noto.
function emojiImageUrl(emoji: string) {
  const name = Array.from(emoji, (char) => char.codePointAt(0) ?? 0)
    .filter((codePoint) => codePoint !== 0xfe0f)
    .map((codePoint) => codePoint.toString(16).padStart(4, "0"))
    .join("_");

  return `${import.meta.env.BASE_URL}emoji/${name}.webp`;
}

export function Emoji({
  emoji,
  className,
}: {
  emoji: string;
  className?: string;
}) {
  const [failedEmoji, setFailedEmoji] = useState<string>();

  if (failedEmoji === emoji) {
    return <span className={className}>{emoji}</span>;
  }

  return (
    <img
      src={emojiImageUrl(emoji)}
      alt={emoji}
      draggable={false}
      decoding="async"
      onError={() => setFailedEmoji(emoji)}
      className={cn(
        "inline-block size-[1.2em] shrink-0 select-none align-[-0.2em]",
        className,
      )}
    />
  );
}

export function ProjectIcon({
  icon,
  className,
}: {
  icon: string;
  className?: string;
}) {
  return <Emoji emoji={icon || "🟡"} className={className} />;
}

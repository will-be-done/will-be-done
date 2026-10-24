import { linkifyText } from "@will-be-done/client/utils";

export function LinkifiedText({ text }: { text: string }) {
  return linkifyText(text).map((part) =>
    part.type === "link" ? (
      <a
        key={part.start}
        href={part.href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent underline decoration-accent/50 underline-offset-2"
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        {part.value}
      </a>
    ) : (
      part.value
    ),
  );
}

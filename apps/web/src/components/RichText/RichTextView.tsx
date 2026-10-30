import { Fragment, useMemo, type ReactNode } from "react";
import {
  markdownToRichTextNodes,
  type RichTextNode,
} from "@will-be-done/slices/common";
import { cn } from "@/lib/utils";
import { linkHref } from "./links";

const stopPropagation = (event: React.SyntheticEvent) =>
  event.stopPropagation();

function renderText(node: RichTextNode, key: number): ReactNode {
  let content: ReactNode = node.text;
  for (const mark of node.marks ?? []) {
    if (mark.type === "code") content = <code>{content}</code>;
    else if (mark.type === "italic") content = <em>{content}</em>;
    else if (mark.type === "bold") content = <strong>{content}</strong>;
    else if (mark.type === "strike") content = <s>{content}</s>;
  }
  const link = node.marks?.find((mark) => mark.type === "link");
  const href = link?.attrs?.href && linkHref(link.attrs.href, node.text);
  if (href) {
    content = (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={stopPropagation}
        onDoubleClick={stopPropagation}
      >
        {content}
      </a>
    );
  }
  return <Fragment key={key}>{content}</Fragment>;
}

// Renders a single-line rich text field: a title or a checklist item.
export function RichTextView({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const nodes = useMemo(
    () =>
      markdownToRichTextNodes(text, "title").flatMap(
        (node) => node.content ?? [],
      ),
    [text],
  );
  return (
    <span data-rich-text-view className={cn("rich-text", className)}>{nodes.map(renderText)}</span>
  );
}

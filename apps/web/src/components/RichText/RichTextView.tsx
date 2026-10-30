/* eslint-disable react-x/no-array-index-key -- parsed markdown is re-rendered whole and has no item identity */
import { Fragment, useMemo, type ReactNode } from "react";
import {
  markdownToRichTextNodes,
  type RichTextKind,
  type RichTextNode,
} from "@will-be-done/slices/common";
import { cn } from "@/lib/utils";

const stopPropagation = (event: React.SyntheticEvent) =>
  event.stopPropagation();

const SAFE_HREF = /^(?:https?:|mailto:)/i;

function renderText(node: RichTextNode, key: number): ReactNode {
  let content: ReactNode = node.text;
  for (const mark of node.marks ?? []) {
    if (mark.type === "code") content = <code>{content}</code>;
    else if (mark.type === "italic") content = <em>{content}</em>;
    else if (mark.type === "bold") content = <strong>{content}</strong>;
    else if (mark.type === "strike") content = <s>{content}</s>;
  }
  const link = node.marks?.find((mark) => mark.type === "link");
  // Bare www. links get a secure scheme, as linkified text did before.
  const href =
    link?.attrs?.href === `http://${node.text}` && node.text?.startsWith("www.")
      ? `https://${node.text}`
      : link?.attrs?.href;
  if (href && SAFE_HREF.test(href)) {
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

function renderNodes(nodes: RichTextNode[] | undefined): ReactNode[] {
  return (nodes ?? []).map((node, index) => {
    const children = renderNodes(node.content);
    switch (node.type) {
      case "text":
        return renderText(node, index);
      case "hardBreak":
        return <br key={index} />;
      case "heading": {
        const level = Math.min(Math.max(Number(node.attrs?.level) || 1, 1), 6);
        const Heading = `h${level}` as "h1";
        return <Heading key={index}>{children}</Heading>;
      }
      case "bulletList":
        return <ul key={index}>{children}</ul>;
      case "orderedList":
        return (
          <ol key={index} start={Number(node.attrs?.start) || 1}>
            {children}
          </ol>
        );
      case "listItem":
        return <li key={index}>{children}</li>;
      case "blockquote":
        return <blockquote key={index}>{children}</blockquote>;
      case "codeBlock":
        return (
          <pre key={index}>
            <code>{children}</code>
          </pre>
        );
      case "horizontalRule":
        return <hr key={index} />;
      default:
        return <p key={index}>{children}</p>;
    }
  });
}

export function RichTextView({
  text,
  kind,
  className,
}: {
  text: string;
  kind: RichTextKind;
  className?: string;
}) {
  const nodes = useMemo(
    () => markdownToRichTextNodes(text, kind),
    [text, kind],
  );
  if (kind === "title") {
    return (
      <span className={cn("rich-text", className)}>
        {renderNodes(nodes.flatMap((node) => node.content ?? []))}
      </span>
    );
  }
  return <div className={cn("rich-text", className)}>{renderNodes(nodes)}</div>;
}

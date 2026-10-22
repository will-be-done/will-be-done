import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { LinkifiedText } from "./LinkifiedText";
import { linkifyText } from "./linkifyText";

describe("linkifyText", () => {
  it("finds HTTP links and preserves surrounding text", () => {
    expect(linkifyText("Read https://example.com/docs today")).toEqual([
      { type: "text", value: "Read ", start: 0 },
      {
        type: "link",
        value: "https://example.com/docs",
        href: "https://example.com/docs",
        start: 5,
      },
      { type: "text", value: " today", start: 29 },
    ]);
  });

  it("adds a secure scheme to www links", () => {
    expect(linkifyText("WWW.example.com")).toEqual([
      {
        type: "link",
        value: "WWW.example.com",
        href: "https://WWW.example.com",
        start: 0,
      },
    ]);
  });

  it("keeps sentence punctuation outside the link", () => {
    expect(linkifyText("See (https://example.com/a_(b)). Next.")).toEqual([
      { type: "text", value: "See (", start: 0 },
      {
        type: "link",
        value: "https://example.com/a_(b)",
        href: "https://example.com/a_(b)",
        start: 5,
      },
      { type: "text", value: "). Next.", start: 30 },
    ]);
  });
});

describe("LinkifiedText", () => {
  it("renders safe new-tab anchors", () => {
    const markup = renderToStaticMarkup(
      <LinkifiedText text="Open https://example.com" />,
    );

    expect(markup).toContain('href="https://example.com"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');
  });
});

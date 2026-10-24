const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>`]+/giu;
const TRAILING_PUNCTUATION = new Set([".", ",", "!", "?", ";", ":", '"', "'"]);

export type LinkifiedTextPart =
  | { type: "text"; value: string; start: number }
  | { type: "link"; value: string; href: string; start: number };

function trimLinkEnd(value: string) {
  let end = value.length;

  while (end > 0) {
    const finalCharacter = value[end - 1];
    if (TRAILING_PUNCTUATION.has(finalCharacter)) {
      end -= 1;
      continue;
    }

    const bracketPairs = [
      ["(", ")"],
      ["[", "]"],
      ["{", "}"],
    ] as const;
    const pair = bracketPairs.find(([, closing]) => closing === finalCharacter);
    if (!pair) break;

    const candidate = value.slice(0, end);
    const openingCount = candidate.split(pair[0]).length - 1;
    const closingCount = candidate.split(pair[1]).length - 1;
    if (closingCount <= openingCount) break;

    end -= 1;
  }

  return value.slice(0, end);
}

export function linkifyText(text: string): LinkifiedTextPart[] {
  const parts: LinkifiedTextPart[] = [];
  let cursor = 0;
  const pushText = (value: string, start: number) => {
    if (!value) return;

    const previousPart = parts.at(-1);
    if (previousPart?.type === "text") {
      previousPart.value += value;
    } else {
      parts.push({ type: "text", value, start });
    }
  };

  for (const match of text.matchAll(URL_PATTERN)) {
    const matchIndex = match.index;
    const matchedValue = match[0];
    const linkValue = trimLinkEnd(matchedValue);

    if (matchIndex > cursor) {
      pushText(text.slice(cursor, matchIndex), cursor);
    }

    if (linkValue) {
      parts.push({
        type: "link",
        value: linkValue,
        href: /^www\./i.test(linkValue) ? `https://${linkValue}` : linkValue,
        start: matchIndex,
      });
    }

    const matchEnd = matchIndex + matchedValue.length;
    const trimmedSuffix = matchedValue.slice(linkValue.length);
    pushText(trimmedSuffix, matchIndex + linkValue.length);
    cursor = matchEnd;
  }

  if (cursor < text.length) {
    pushText(text.slice(cursor), cursor);
  }

  return parts;
}

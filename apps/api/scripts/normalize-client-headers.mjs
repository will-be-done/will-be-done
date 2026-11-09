// Normalizes the header object the generated fetch client builds.
//
// orval emits `headers: { "Content-Type": "application/json", ...getHeaders(options?.headers) }`
// and `getHeaders` copies a `Headers` instance's keys as-is. `Headers` entries are
// lower-cased, so a caller that passes `new Headers({ "Content-Type": ... })` ends up
// with both `Content-Type` and `content-type` in the object and fetch joins them into
// `application/json, application/json`. Lower-casing every key in `getHeaders` (and the
// literal it is spread over) makes the spread replace instead of duplicate.
//
// This runs as part of `client:generate` so a regeneration keeps the fix. It fails
// loudly when orval changes the shape it knows how to rewrite, rather than silently
// emitting the duplicate again.

import { readFile, writeFile } from "node:fs/promises";

const CLIENT = new URL("../src/generated/v1-client.ts", import.meta.url);

const GET_HEADERS =
  /  const getHeaders = \(\n    h\?: NonNullable<RequestInit\["headers"\]>,\n  \): Record<string, string \| readonly string\[\]> => \{[\s\S]*?\n  \};\n/g;

const REWRITTEN = `  const getHeaders = (
    h?: NonNullable<RequestInit["headers"]>,
  ): Record<string, string | readonly string[]> => {
    if (!h) {
      return {};
    }
    if (h instanceof Headers) {
      return Object.fromEntries(
        [...h.entries()].map(([name, value]) => [name.toLowerCase(), value]),
      );
    }
    if (Symbol.iterator in h) {
      return Object.fromEntries(
        Array.from(
          h as Iterable<Iterable<string>>,
          (entry) => Array.from(entry) as [string, string],
        ).map(([name, value]) => [name.toLowerCase(), value]),
      );
    }
    const headers: Record<string, string | readonly string[]> = {};
    for (const [name, value] of Object.entries<
      string | readonly string[] | undefined
    >(h)) {
      if (value !== undefined) {
        headers[name.toLowerCase()] = value;
      }
    }
    return headers;
  };
`;

const source = await readFile(CLIENT, "utf8");
const declared = (source.match(/const getHeaders = \(/g) ?? []).length;
const matched = [...source.matchAll(GET_HEADERS)].length;

if (declared === 0 || matched !== declared) {
  throw new Error(
    `normalize-client-headers: expected ${declared} getHeaders helpers, rewrote ${matched}; orval's output changed and the header fix must be re-derived`,
  );
}

let output = source.replace(GET_HEADERS, () => REWRITTEN);

const literal = '"Content-Type":';
const literals = output.split(literal).length - 1;
if (literals === 0) {
  throw new Error(
    'normalize-client-headers: no "Content-Type" literal found; orval\'s output changed and the header fix must be re-derived',
  );
}
output = output.replaceAll(literal, '"content-type":');

if (
  /["']Content-Type["']\s*:/.test(output) ||
  /["']Accept["']\s*:/.test(output)
) {
  throw new Error(
    "normalize-client-headers: a capitalised header key survived the rewrite",
  );
}

await writeFile(CLIENT, output);
console.log(
  `normalize-client-headers: rewrote ${matched} getHeaders helpers and ${literals} Content-Type literals`,
);

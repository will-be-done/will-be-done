/**
 * `set:html` writes the string into the document verbatim, so a `</script>` in
 * any value would close the element early and the rest would be parsed as HTML.
 * Escaping `<` as `\u003c` keeps the JSON equivalent and the element intact.
 */
export function serialiseJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

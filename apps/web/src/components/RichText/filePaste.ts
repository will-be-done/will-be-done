const hasText = (html: string) =>
  html
    .replace(/<!--[\s\S]*?-->|<(style|script)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<[^>]*>|&nbsp;|&#160;/gi, "")
    .trim() !== "";

// Spreadsheets and word processors put a picture of the copied text on the
// clipboard next to the text itself. That is a text paste, not a file.
export const pastedFiles = (
  data: Pick<DataTransfer, "files" | "getData"> | null,
) => {
  if (!data || hasText(data.getData("text/html"))) return [];
  return Array.from(data.files);
};

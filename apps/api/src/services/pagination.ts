import { BadRequestError } from "./errors";

export interface NumericCursor {
  sort: number;
  id: string;
}

export function encodeNumericCursor(cursor: NumericCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeNumericCursor(cursor: string): NumericCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as Partial<NumericCursor>;
    if (
      typeof parsed.sort !== "number" ||
      !Number.isFinite(parsed.sort) ||
      typeof parsed.id !== "string" ||
      parsed.id.length === 0
    ) {
      throw new Error("Invalid cursor payload");
    }
    return { sort: parsed.sort, id: parsed.id };
  } catch {
    throw new BadRequestError("Invalid pagination cursor");
  }
}

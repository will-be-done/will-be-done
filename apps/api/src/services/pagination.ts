import { Effect, Schema } from "effect";
import { BadRequestError } from "./errors";

const NumericCursor = Schema.Struct({
  sort: Schema.Finite,
  id: Schema.NonEmptyString,
});
export type NumericCursor = typeof NumericCursor.Type;

const StringCursor = Schema.Struct({
  sort: Schema.NonEmptyString,
  id: Schema.NonEmptyString,
});
export type StringCursor = typeof StringCursor.Type;

const encodeCursor = (cursor: NumericCursor | StringCursor): string =>
  Buffer.from(JSON.stringify({ sort: cursor.sort, id: cursor.id })).toString(
    "base64url",
  );

const cursorDecoder =
  <S extends typeof NumericCursor | typeof StringCursor>(schema: S) =>
  (cursor: string): Effect.Effect<S["Type"], BadRequestError> =>
    Schema.decodeUnknownEffect(Schema.fromJsonString(schema))(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ).pipe(
      Effect.mapError(
        () => new BadRequestError({ message: "Invalid pagination cursor" }),
      ),
    );

export const encodeNumericCursor: (cursor: NumericCursor) => string =
  encodeCursor;
export const decodeNumericCursor = cursorDecoder(NumericCursor);
export const encodeStringCursor: (cursor: StringCursor) => string =
  encodeCursor;
export const decodeStringCursor = cursorDecoder(StringCursor);

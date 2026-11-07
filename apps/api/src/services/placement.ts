import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import { Effect } from "effect";
import { ConflictError } from "./errors";

export type Placement =
  | { kind: "first" }
  | { kind: "last" }
  | { kind: "before"; anchorId: string }
  | { kind: "after"; anchorId: string };

export interface OrderedEntity {
  id: string;
  orderToken: string;
}

const anchorIndex = <T extends OrderedEntity>(
  entities: T[],
  placement: Extract<Placement, { anchorId: string }>,
): Effect.Effect<number, ConflictError> => {
  const index = entities.findIndex(
    (entity) => entity.id === placement.anchorId,
  );
  return index === -1
    ? Effect.fail(
        new ConflictError({
          message:
            "Placement anchor must be an entity in the destination collection",
        }),
      )
    : Effect.succeed(index);
};

export const resolveCreatePosition = Effect.fnUntraced(function* <
  T extends OrderedEntity,
>({
  entities,
  placement,
}: {
  entities: T[];
  placement: Placement;
}): Effect.fn.Return<
  "prepend" | "append" | [T | null, T | null],
  ConflictError
> {
  if (placement.kind === "first") return "prepend";
  if (placement.kind === "last") return "append";

  const index = yield* anchorIndex(entities, placement);
  if (placement.kind === "before") {
    return [entities[index - 1] ?? null, entities[index]];
  }
  return [entities[index], entities[index + 1] ?? null];
});

export const resolveOrderToken = Effect.fnUntraced(function* <
  T extends OrderedEntity,
>({
  entities,
  placement,
}: {
  entities: T[];
  placement: Placement;
}): Effect.fn.Return<string, ConflictError> {
  const position = yield* resolveCreatePosition({ entities, placement });
  const [preceding, following] =
    position === "prepend"
      ? [null, entities[0] ?? null]
      : position === "append"
        ? [entities[entities.length - 1] ?? null, null]
        : position;

  return generateJitteredKeyBetween(
    preceding?.orderToken ?? null,
    following?.orderToken ?? null,
  );
});

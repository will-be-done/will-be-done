import type { HyperDB } from "@will-be-done/hyperdb";
import { Effect } from "effect";
import {
  projectSectionById,
  projectSectionItems,
} from "@will-be-done/slices/space";
import { ResourceNotFoundError } from "./errors";
import { select } from "./hyperdb";

export const requireSection = Effect.fnUntraced(function* (
  db: HyperDB,
  sectionId: string,
) {
  const section = yield* select(db, {
    selector: projectSectionById,
    args: { id: sectionId },
  });
  if (!section) {
    return yield* new ResourceNotFoundError({ resource: "Project section" });
  }
  return section;
});

export const itemsInSection = (
  db: HyperDB,
  sectionId: string,
  excludedId?: string,
) =>
  select(db, {
    selector: projectSectionItems,
    args: { projectSectionId: sectionId },
  }).pipe(
    Effect.map((items) => items.filter((item) => item.id !== excludedId)),
  );

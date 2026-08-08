import { selectAsync } from "@will-be-done/hyperdb";
import {
  projectSectionById,
  projectSectionItems,
  type Item,
} from "@will-be-done/slices/space";
import { getSpaceDatabase } from "./databaseAccess";
import { ResourceNotFoundError } from "./errors";

type SpaceDatabase = Awaited<ReturnType<typeof getSpaceDatabase>>;

export async function requireSection(db: SpaceDatabase, sectionId: string) {
  const section = await selectAsync(db, {
    selector: projectSectionById,
    args: { id: sectionId },
  });
  if (!section) throw new ResourceNotFoundError("Project section");
  return section;
}

export async function itemsInSection(
  db: SpaceDatabase,
  sectionId: string,
  excludedId?: string,
): Promise<Item[]> {
  return (
    await selectAsync(db, {
      selector: projectSectionItems,
      args: { projectSectionId: sectionId },
    })
  ).filter((item) => item.id !== excludedId);
}

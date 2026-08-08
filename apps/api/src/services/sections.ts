import { asyncDispatch, selectAsync } from "@will-be-done/hyperdb";
import {
  createProjectSection as createProjectSectionAction,
  deleteProjectSections,
  projectById,
  projectSectionById,
  projectSectionsByProjectId,
  updateProjectSection as updateProjectSectionAction,
} from "@will-be-done/slices/space";
import { getSpaceDatabase } from "./databaseAccess";
import { ConflictError, ResourceNotFoundError } from "./errors";
import {
  resolveCreatePosition,
  resolveOrderToken,
  type Placement,
} from "./placement";

export interface PublicProjectSection {
  id: string;
  projectId: string;
  title: string;
  createdAt: number;
}

function toPublicProjectSection({
  id,
  projectId,
  title,
  createdAt,
}: PublicProjectSection): PublicProjectSection {
  return { id, projectId, title, createdAt };
}

export async function listProjectSections({
  spaceId,
  projectId,
  userId,
}: {
  spaceId: string;
  projectId: string;
  userId: string;
}): Promise<PublicProjectSection[]> {
  const db = await getSpaceDatabase(spaceId, userId);
  const project = await selectAsync(db, {
    selector: projectById,
    args: { id: projectId },
  });
  if (!project) throw new ResourceNotFoundError("Project");

  return (
    await selectAsync(db, {
      selector: projectSectionsByProjectId,
      args: { projectId },
    })
  ).map(toPublicProjectSection);
}

export async function getProjectSection({
  spaceId,
  sectionId,
  userId,
}: {
  spaceId: string;
  sectionId: string;
  userId: string;
}): Promise<PublicProjectSection> {
  const db = await getSpaceDatabase(spaceId, userId);
  const section = await selectAsync(db, {
    selector: projectSectionById,
    args: { id: sectionId },
  });
  if (!section) throw new ResourceNotFoundError("Project section");
  return toPublicProjectSection(section);
}

export async function createProjectSection({
  spaceId,
  projectId,
  userId,
  title,
  placement = { kind: "last" },
}: {
  spaceId: string;
  projectId: string;
  userId: string;
  title: string;
  placement?: Placement;
}): Promise<PublicProjectSection> {
  const db = await getSpaceDatabase(spaceId, userId);
  const project = await selectAsync(db, {
    selector: projectById,
    args: { id: projectId },
  });
  if (!project) throw new ResourceNotFoundError("Project");
  if (project.isInbox) {
    throw new ConflictError("Inbox project cannot contain project sections");
  }

  const sections =
    placement.kind === "before" || placement.kind === "after"
      ? await selectAsync(db, {
          selector: projectSectionsByProjectId,
          args: { projectId },
        })
      : [];
  return toPublicProjectSection(
    await asyncDispatch(
      db,
      createProjectSectionAction({
        sectionDraft: { projectId, title },
        position: resolveCreatePosition({ entities: sections, placement }),
      }),
    ),
  );
}

export async function updateProjectSection({
  spaceId,
  sectionId,
  userId,
  updates,
}: {
  spaceId: string;
  sectionId: string;
  userId: string;
  updates: { title?: string };
}): Promise<PublicProjectSection> {
  const db = await getSpaceDatabase(spaceId, userId);
  const current = await selectAsync(db, {
    selector: projectSectionById,
    args: { id: sectionId },
  });
  if (!current) throw new ResourceNotFoundError("Project section");

  await asyncDispatch(
    db,
    updateProjectSectionAction({
      projectSectionId: sectionId,
      section: {
        ...(updates.title === undefined ? {} : { title: updates.title }),
      },
    }),
  );

  const updated = await selectAsync(db, {
    selector: projectSectionById,
    args: { id: sectionId },
  });
  if (!updated) throw new ResourceNotFoundError("Project section");
  return toPublicProjectSection(updated);
}

export async function moveProjectSection({
  spaceId,
  sectionId,
  userId,
  projectId,
  placement,
}: {
  spaceId: string;
  sectionId: string;
  userId: string;
  projectId: string;
  placement: Placement;
}): Promise<PublicProjectSection> {
  const db = await getSpaceDatabase(spaceId, userId);
  const current = await selectAsync(db, {
    selector: projectSectionById,
    args: { id: sectionId },
  });
  if (!current) throw new ResourceNotFoundError("Project section");
  const currentProject = await selectAsync(db, {
    selector: projectById,
    args: { id: current.projectId },
  });
  if (currentProject?.isInbox) {
    throw new ConflictError("Inbox section cannot be moved");
  }
  const destinationProject = await selectAsync(db, {
    selector: projectById,
    args: { id: projectId },
  });
  if (!destinationProject) throw new ResourceNotFoundError("Project");
  if (destinationProject.isInbox) {
    throw new ConflictError("Inbox project cannot contain project sections");
  }

  const sections = (
    await selectAsync(db, {
      selector: projectSectionsByProjectId,
      args: { projectId },
    })
  ).filter((section) => section.id !== sectionId);
  await asyncDispatch(
    db,
    updateProjectSectionAction({
      projectSectionId: sectionId,
      section: {
        projectId,
        orderToken: resolveOrderToken({ entities: sections, placement }),
      },
    }),
  );
  const updated = await selectAsync(db, {
    selector: projectSectionById,
    args: { id: sectionId },
  });
  if (!updated) throw new ResourceNotFoundError("Project section");
  return toPublicProjectSection(updated);
}

export async function deleteProjectSection({
  spaceId,
  sectionId,
  userId,
}: {
  spaceId: string;
  sectionId: string;
  userId: string;
}): Promise<void> {
  const db = await getSpaceDatabase(spaceId, userId);
  const section = await selectAsync(db, {
    selector: projectSectionById,
    args: { id: sectionId },
  });
  if (!section) throw new ResourceNotFoundError("Project section");
  const project = await selectAsync(db, {
    selector: projectById,
    args: { id: section.projectId },
  });
  if (project?.isInbox) {
    throw new ConflictError("Inbox section cannot be deleted");
  }
  await asyncDispatch(db, deleteProjectSections({ ids: [sectionId] }));
}

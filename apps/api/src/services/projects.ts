import { asyncDispatch, selectAsync } from "@will-be-done/hyperdb";
import {
  allProjects,
  createProject as createProjectAction,
  deleteProjects,
  projectById,
  updateProject as updateProjectAction,
} from "@will-be-done/slices/space";
import { getSpaceDatabase } from "./databaseAccess";
import { ConflictError, ResourceNotFoundError } from "./errors";
import {
  resolveCreatePosition,
  resolveOrderToken,
  type Placement,
} from "./placement";

export interface PublicProject {
  id: string;
  title: string;
  icon: string;
  isInbox: boolean;
  createdAt: number;
}

function toPublicProject({
  id,
  title,
  icon,
  isInbox,
  createdAt,
}: PublicProject): PublicProject {
  return { id, title, icon, isInbox, createdAt };
}

export async function listSpaceProjects({
  spaceId,
  userId,
}: {
  spaceId: string;
  userId: string;
}): Promise<PublicProject[]> {
  const db = await getSpaceDatabase(spaceId, userId);
  const projects = await selectAsync(db, { selector: allProjects, args: {} });

  return projects.map(toPublicProject);
}

export async function getSpaceProject({
  spaceId,
  projectId,
  userId,
}: {
  spaceId: string;
  projectId: string;
  userId: string;
}): Promise<PublicProject> {
  const db = await getSpaceDatabase(spaceId, userId);
  const project = await selectAsync(db, {
    selector: projectById,
    args: { id: projectId },
  });
  if (!project) throw new ResourceNotFoundError("Project");
  return toPublicProject(project);
}

export async function createSpaceProject({
  spaceId,
  userId,
  title,
  icon = "",
  placement = { kind: "last" },
}: {
  spaceId: string;
  userId: string;
  title: string;
  icon?: string;
  placement?: Placement;
}): Promise<PublicProject> {
  const db = await getSpaceDatabase(spaceId, userId);
  const projects =
    placement.kind === "before" || placement.kind === "after"
      ? await selectAsync(db, { selector: allProjects, args: {} })
      : [];
  const project = await asyncDispatch(
    db,
    createProjectAction({
      project: { title, icon },
      position: resolveCreatePosition({ entities: projects, placement }),
    }),
  );
  return toPublicProject(project);
}

export async function updateSpaceProject({
  spaceId,
  projectId,
  userId,
  updates,
}: {
  spaceId: string;
  projectId: string;
  userId: string;
  updates: { title?: string; icon?: string };
}): Promise<PublicProject> {
  const db = await getSpaceDatabase(spaceId, userId);
  const current = await selectAsync(db, {
    selector: projectById,
    args: { id: projectId },
  });
  if (!current) throw new ResourceNotFoundError("Project");

  await asyncDispatch(
    db,
    updateProjectAction({
      id: projectId,
      project: {
        ...(updates.title === undefined ? {} : { title: updates.title }),
        ...(updates.icon === undefined ? {} : { icon: updates.icon }),
      },
    }),
  );

  const updated = await selectAsync(db, {
    selector: projectById,
    args: { id: projectId },
  });
  if (!updated) throw new ResourceNotFoundError("Project");
  return toPublicProject(updated);
}

export async function moveSpaceProject({
  spaceId,
  projectId,
  userId,
  placement,
}: {
  spaceId: string;
  projectId: string;
  userId: string;
  placement: Placement;
}): Promise<PublicProject> {
  const db = await getSpaceDatabase(spaceId, userId);
  const current = await selectAsync(db, {
    selector: projectById,
    args: { id: projectId },
  });
  if (!current) throw new ResourceNotFoundError("Project");
  const projects = (
    await selectAsync(db, { selector: allProjects, args: {} })
  ).filter((project) => project.id !== projectId);
  await asyncDispatch(
    db,
    updateProjectAction({
      id: projectId,
      project: {
        orderToken: resolveOrderToken({ entities: projects, placement }),
      },
    }),
  );
  const updated = await selectAsync(db, {
    selector: projectById,
    args: { id: projectId },
  });
  if (!updated) throw new ResourceNotFoundError("Project");
  return toPublicProject(updated);
}

export async function deleteSpaceProject({
  spaceId,
  projectId,
  userId,
}: {
  spaceId: string;
  projectId: string;
  userId: string;
}): Promise<void> {
  const db = await getSpaceDatabase(spaceId, userId);
  const project = await selectAsync(db, {
    selector: projectById,
    args: { id: projectId },
  });
  if (!project) throw new ResourceNotFoundError("Project");
  if (project.isInbox)
    throw new ConflictError("Inbox project cannot be deleted");
  await asyncDispatch(db, deleteProjects({ ids: [projectId] }));
}

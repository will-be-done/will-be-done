import { selectSync, syncDispatch } from "@will-be-done/hyperdb";
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

export function listSpaceProjects({
  spaceId,
  userId,
}: {
  spaceId: string;
  userId: string;
}): PublicProject[] {
  const db = getSpaceDatabase(spaceId, userId);
  const projects = selectSync(db, { selector: allProjects, args: {} });

  return projects.map(toPublicProject);
}

export function getSpaceProject({
  spaceId,
  projectId,
  userId,
}: {
  spaceId: string;
  projectId: string;
  userId: string;
}): PublicProject {
  const db = getSpaceDatabase(spaceId, userId);
  const project = selectSync(db, {
    selector: projectById,
    args: { id: projectId },
  });
  if (!project) throw new ResourceNotFoundError("Project");
  return toPublicProject(project);
}

export function createSpaceProject({
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
}): PublicProject {
  const db = getSpaceDatabase(spaceId, userId);
  const projects =
    placement.kind === "before" || placement.kind === "after"
      ? selectSync(db, { selector: allProjects, args: {} })
      : [];
  const project = syncDispatch(
    db,
    createProjectAction({
      project: { title, icon },
      position: resolveCreatePosition({ entities: projects, placement }),
    }),
  );
  return toPublicProject(project);
}

export function updateSpaceProject({
  spaceId,
  projectId,
  userId,
  updates,
}: {
  spaceId: string;
  projectId: string;
  userId: string;
  updates: { title?: string; icon?: string };
}): PublicProject {
  const db = getSpaceDatabase(spaceId, userId);
  const current = selectSync(db, {
    selector: projectById,
    args: { id: projectId },
  });
  if (!current) throw new ResourceNotFoundError("Project");

  syncDispatch(
    db,
    updateProjectAction({
      id: projectId,
      project: {
        ...(updates.title === undefined ? {} : { title: updates.title }),
        ...(updates.icon === undefined ? {} : { icon: updates.icon }),
      },
    }),
  );

  const updated = selectSync(db, {
    selector: projectById,
    args: { id: projectId },
  });
  if (!updated) throw new ResourceNotFoundError("Project");
  return toPublicProject(updated);
}

export function moveSpaceProject({
  spaceId,
  projectId,
  userId,
  placement,
}: {
  spaceId: string;
  projectId: string;
  userId: string;
  placement: Placement;
}): PublicProject {
  const db = getSpaceDatabase(spaceId, userId);
  const current = selectSync(db, {
    selector: projectById,
    args: { id: projectId },
  });
  if (!current) throw new ResourceNotFoundError("Project");
  const projects = selectSync(db, { selector: allProjects, args: {} }).filter(
    (project) => project.id !== projectId,
  );
  syncDispatch(
    db,
    updateProjectAction({
      id: projectId,
      project: {
        orderToken: resolveOrderToken({ entities: projects, placement }),
      },
    }),
  );
  const updated = selectSync(db, {
    selector: projectById,
    args: { id: projectId },
  });
  if (!updated) throw new ResourceNotFoundError("Project");
  return toPublicProject(updated);
}

export function deleteSpaceProject({
  spaceId,
  projectId,
  userId,
}: {
  spaceId: string;
  projectId: string;
  userId: string;
}): void {
  const db = getSpaceDatabase(spaceId, userId);
  const project = selectSync(db, {
    selector: projectById,
    args: { id: projectId },
  });
  if (!project) throw new ResourceNotFoundError("Project");
  if (project.isInbox)
    throw new ConflictError("Inbox project cannot be deleted");
  syncDispatch(db, deleteProjects({ ids: [projectId] }));
}

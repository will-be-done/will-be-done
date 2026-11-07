import type { HyperDB } from "@will-be-done/hyperdb";
import { Effect } from "effect";
import {
  allProjects,
  createProject as createProjectAction,
  deleteProjects,
  projectById,
  updateProject as updateProjectAction,
} from "@will-be-done/slices/space";
import { getSpaceDatabase } from "./databaseAccess";
import { ConflictError, ResourceNotFoundError } from "./errors";
import { dispatch, select } from "./hyperdb";
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

export const requireProject = Effect.fnUntraced(function* (
  db: HyperDB,
  projectId: string,
) {
  const project = yield* select(db, {
    selector: projectById,
    args: { id: projectId },
  });
  if (!project)
    return yield* new ResourceNotFoundError({ resource: "Project" });
  return project;
});

export const listSpaceProjects = Effect.fn("listSpaceProjects")(function* ({
  spaceId,
  userId,
}: {
  spaceId: string;
  userId: string;
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  const projects = yield* select(db, { selector: allProjects, args: {} });
  return projects.map(toPublicProject);
});

export const getSpaceProject = Effect.fn("getSpaceProject")(function* ({
  spaceId,
  projectId,
  userId,
}: {
  spaceId: string;
  projectId: string;
  userId: string;
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  return toPublicProject(yield* requireProject(db, projectId));
});

export const createSpaceProject = Effect.fn("createSpaceProject")(function* ({
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
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  const projects =
    placement.kind === "before" || placement.kind === "after"
      ? yield* select(db, { selector: allProjects, args: {} })
      : [];
  const project = yield* dispatch(
    db,
    createProjectAction({
      project: { title, icon },
      position: yield* resolveCreatePosition({ entities: projects, placement }),
    }),
  );
  return toPublicProject(project);
});

export const updateSpaceProject = Effect.fn("updateSpaceProject")(function* ({
  spaceId,
  projectId,
  userId,
  updates,
}: {
  spaceId: string;
  projectId: string;
  userId: string;
  updates: { title?: string; icon?: string };
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  yield* requireProject(db, projectId);

  yield* dispatch(
    db,
    updateProjectAction({
      id: projectId,
      project: {
        ...(updates.title === undefined ? {} : { title: updates.title }),
        ...(updates.icon === undefined ? {} : { icon: updates.icon }),
      },
    }),
  );

  return toPublicProject(yield* requireProject(db, projectId));
});

export const moveSpaceProject = Effect.fn("moveSpaceProject")(function* ({
  spaceId,
  projectId,
  userId,
  placement,
}: {
  spaceId: string;
  projectId: string;
  userId: string;
  placement: Placement;
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  yield* requireProject(db, projectId);
  const projects = (yield* select(db, {
    selector: allProjects,
    args: {},
  })).filter((project) => project.id !== projectId);
  yield* dispatch(
    db,
    updateProjectAction({
      id: projectId,
      project: {
        orderToken: yield* resolveOrderToken({ entities: projects, placement }),
      },
    }),
  );
  return toPublicProject(yield* requireProject(db, projectId));
});

export const deleteSpaceProject = Effect.fn("deleteSpaceProject")(function* ({
  spaceId,
  projectId,
  userId,
}: {
  spaceId: string;
  projectId: string;
  userId: string;
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  const project = yield* requireProject(db, projectId);
  if (project.isInbox) {
    return yield* new ConflictError({
      message: "Inbox project cannot be deleted",
    });
  }
  yield* dispatch(db, deleteProjects({ ids: [projectId] }));
});

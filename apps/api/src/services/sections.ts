import { Effect } from "effect";
import {
  createProjectSection as createProjectSectionAction,
  deleteProjectSections,
  projectById,
  projectSectionsByProjectId,
  updateProjectSection as updateProjectSectionAction,
} from "@will-be-done/slices/space";
import { getSpaceDatabase } from "./databaseAccess";
import { ConflictError } from "./errors";
import { dispatch, select } from "./hyperdb";
import {
  resolveCreatePosition,
  resolveOrderToken,
  type Placement,
} from "./placement";
import { requireProject } from "./projects";
import { requireSection } from "./sectionQueries";

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

const inboxCannotContainSections = () =>
  new ConflictError({
    message: "Inbox project cannot contain project sections",
  });

export const listProjectSections = Effect.fn("listProjectSections")(function* ({
  spaceId,
  projectId,
  userId,
}: {
  spaceId: string;
  projectId: string;
  userId: string;
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  yield* requireProject(db, projectId);

  const sections = yield* select(db, {
    selector: projectSectionsByProjectId,
    args: { projectId },
  });
  return sections.map(toPublicProjectSection);
});

export const getProjectSection = Effect.fn("getProjectSection")(function* ({
  spaceId,
  sectionId,
  userId,
}: {
  spaceId: string;
  sectionId: string;
  userId: string;
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  return toPublicProjectSection(yield* requireSection(db, sectionId));
});

export const createProjectSection = Effect.fn("createProjectSection")(
  function* ({
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
  }) {
    const db = yield* getSpaceDatabase(spaceId, userId);
    const project = yield* requireProject(db, projectId);
    if (project.isInbox) return yield* inboxCannotContainSections();

    const sections =
      placement.kind === "before" || placement.kind === "after"
        ? yield* select(db, {
            selector: projectSectionsByProjectId,
            args: { projectId },
          })
        : [];
    return toPublicProjectSection(
      yield* dispatch(
        db,
        createProjectSectionAction({
          sectionDraft: { projectId, title },
          position: yield* resolveCreatePosition({
            entities: sections,
            placement,
          }),
        }),
      ),
    );
  },
);

export const updateProjectSection = Effect.fn("updateProjectSection")(
  function* ({
    spaceId,
    sectionId,
    userId,
    updates,
  }: {
    spaceId: string;
    sectionId: string;
    userId: string;
    updates: { title?: string };
  }) {
    const db = yield* getSpaceDatabase(spaceId, userId);
    yield* requireSection(db, sectionId);

    yield* dispatch(
      db,
      updateProjectSectionAction({
        projectSectionId: sectionId,
        section: {
          ...(updates.title === undefined ? {} : { title: updates.title }),
        },
      }),
    );

    return toPublicProjectSection(yield* requireSection(db, sectionId));
  },
);

export const moveProjectSection = Effect.fn("moveProjectSection")(function* ({
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
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  const current = yield* requireSection(db, sectionId);
  const currentProject = yield* select(db, {
    selector: projectById,
    args: { id: current.projectId },
  });
  if (currentProject?.isInbox) {
    return yield* new ConflictError({
      message: "Inbox section cannot be moved",
    });
  }
  const destinationProject = yield* requireProject(db, projectId);
  if (destinationProject.isInbox) return yield* inboxCannotContainSections();

  const sections = (yield* select(db, {
    selector: projectSectionsByProjectId,
    args: { projectId },
  })).filter((section) => section.id !== sectionId);
  yield* dispatch(
    db,
    updateProjectSectionAction({
      projectSectionId: sectionId,
      section: {
        projectId,
        orderToken: yield* resolveOrderToken({ entities: sections, placement }),
      },
    }),
  );
  return toPublicProjectSection(yield* requireSection(db, sectionId));
});

export const deleteProjectSection = Effect.fn("deleteProjectSection")(
  function* ({
    spaceId,
    sectionId,
    userId,
  }: {
    spaceId: string;
    sectionId: string;
    userId: string;
  }) {
    const db = yield* getSpaceDatabase(spaceId, userId);
    const section = yield* requireSection(db, sectionId);
    const project = yield* select(db, {
      selector: projectById,
      args: { id: section.projectId },
    });
    if (project?.isInbox) {
      return yield* new ConflictError({
        message: "Inbox section cannot be deleted",
      });
    }
    yield* dispatch(db, deleteProjectSections({ ids: [sectionId] }));
  },
);

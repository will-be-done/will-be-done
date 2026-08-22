import {
  useAsyncDispatch,
  useAsyncSelector,
} from "@will-be-done/hyperdb/react";
import {
  inboxProjectId as getInboxProjectId,
  projectByIdOrDefault,
  updateProject,
} from "@will-be-done/slices/space";
import { ProjectTaskPanel } from "@/components/ProjectView/ProjectTaskPanel.tsx";
import { ProjectItemsList } from "@/components/ProjectItemsList/ProjectItemList.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import {
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerSearch,
} from "@/components/ui/emoji-picker.tsx";
import { useMemo, useState, useEffect } from "react";
import { promptDialog } from "@/components/ui/prompt-dialog-service";
import { Stash } from "@/components/Stash/Stash.tsx";
import { useStashDesktopOffset } from "@/components/Stash/useStashDesktopOffset.ts";

const SM_BREAKPOINT = 640;

function useIsSmallScreen() {
  const [isSmall, setIsSmall] = useState(
    () => window.innerWidth < SM_BREAKPOINT,
  );
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${SM_BREAKPOINT - 1}px)`);
    const onChange = () => setIsSmall(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return isSmall;
}

const ProjectDetailContent = ({ projectId }: { projectId: string }) => {
  const dispatch = useAsyncDispatch();
  const scrollRestorationId = useMemo(
    () => `project-view-scroll-${projectId}`,
    [projectId],
  );
  const { data: project } = useAsyncSelector({
    selector: projectByIdOrDefault,
    args: { id: projectId },
  });

  const handleTitleClick = async () => {
    if (!project) return;
    const newTitle = await promptDialog(
      "Enter new project title",
      project.title,
    );
    if (newTitle == "" || newTitle == null) return;
    await dispatch(
      updateProject({ id: project.id, project: { title: newTitle } }),
    );
  };

  const isSmallScreen = useIsSmallScreen();

  if (!project) return null;

  return (
    <div
      data-scroll-restoration-id={scrollRestorationId}
      className="flex flex-col h-full overflow-y-auto sm:overflow-y-hidden"
      id="main-scrollable-area"
    >
      <div className="pointer-events-none absolute top-0 left-0 right-0 z-0 h-4" />
      {/* Header */}
      <div className="sm:flex-shrink-0 w-full pt-11 sm:pt-5 mb-6">
        <div className="flex w-full justify-center px-4">
          <div className="flex min-w-0 max-w-lg items-start gap-3">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="text-2xl flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity leading-none mt-0.5"
                >
                  {project.icon || "🟡"}
                </button>
              </PopoverTrigger>
              <PopoverContent className="z-50 w-fit p-0">
                <EmojiPicker
                  className="h-[326px] rounded-lg shadow-md"
                  onEmojiSelect={({ emoji }) => {
                    void dispatch(
                      updateProject({
                        id: project.id,
                        project: { icon: emoji },
                      }),
                    );
                  }}
                >
                  <EmojiPickerSearch />
                  <EmojiPickerContent />
                </EmojiPicker>
              </PopoverContent>
            </Popover>

            <button
              type="button"
              onClick={() => void handleTitleClick()}
              className="min-w-0 cursor-pointer text-center"
            >
              <h1 className="text-xl font-bold text-content leading-tight hover:text-primary transition-colors">
                {project.title}
              </h1>
            </button>
          </div>
        </div>
      </div>

      {isSmallScreen ? (
        <div className="w-full">
          <div className="max-w-lg mx-auto px-4 pb-4">
            <ProjectTaskPanel projectId={projectId} embedded />
          </div>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 overflow-auto pb-4">
          <div className="h-full min-w-0 px-4">
            <ProjectItemsList project={project} />
          </div>
        </div>
      )}
    </div>
  );
};

export const ProjectDetailView = ({ projectId }: { projectId: string }) => {
  const { data: inboxProjectId = "" } = useAsyncSelector({
    selector: getInboxProjectId,
    args: {},
  });
  const stashOffset = useStashDesktopOffset();
  const realProjectId = useMemo(() => {
    return projectId === "inbox" ? inboxProjectId : projectId;
  }, [projectId, inboxProjectId]);

  return (
    <div className="relative h-full min-w-0 overflow-hidden">
      <Stash />
      <div
        className="h-full min-w-0"
        style={{
          marginLeft: stashOffset ? `${stashOffset}px` : undefined,
          width: stashOffset ? `calc(100% - ${stashOffset}px)` : undefined,
          transition: "margin-left 200ms ease-out, width 200ms ease-out",
        }}
      >
        <ProjectDetailContent projectId={realProjectId} />
      </div>
    </div>
  );
};

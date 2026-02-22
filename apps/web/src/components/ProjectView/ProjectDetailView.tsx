import { useDispatch, useSyncSelector } from "@will-be-done/hyperdb";
import { projectsSlice } from "@will-be-done/slices/space";
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

const DeleteIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 12 13"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M9.41667 2.91667V10.5C9.41667 10.7873 9.30253 11.0629 9.09937 11.266C8.8962 11.4692 8.62065 11.5833 8.33333 11.5833H2.91667C2.62935 11.5833 2.3538 11.4692 2.15063 11.266C1.94747 11.0629 1.83333 10.7873 1.83333 10.5V2.91667M0.75 2.91667H10.5M3.45833 2.91667V1.83333C3.45833 1.54602 3.57247 1.27047 3.77563 1.0673C3.9788 0.864137 4.25435 0.75 4.54167 0.75H6.70833C6.99565 0.75 7.2712 0.864137 7.47437 1.0673C7.67753 1.27047 7.79167 1.54602 7.79167 1.83333V2.91667"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

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
  const dispatch = useDispatch();
  const project = useSyncSelector(
    () => projectsSlice.byIdOrDefault(projectId),
    [projectId],
  );

  const handleDeleteClick = () => {
    const shouldDelete = confirm(
      "Are you sure you want to delete this project?",
    );
    if (shouldDelete) {
      dispatch(projectsSlice.delete([project.id]));
    }
  };

  const handleTitleClick = () => {
    const newTitle = prompt("Enter new project title", project.title);
    if (newTitle == "" || newTitle == null) return;
    dispatch(projectsSlice.update(project.id, { title: newTitle }));
  };

  const isSmallScreen = useIsSmallScreen();

  return (
    <div className="flex flex-col h-full overflow-y-auto sm:overflow-y-hidden">
      {/* Header */}
      <div className="sm:flex-shrink-0 w-full pt-5 mb-6">
        <div className="max-w-lg mx-auto px-4">
          <div className="flex items-start gap-3">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="text-4xl flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity leading-none mt-1"
                >
                  {project.icon || "🟡"}
                </button>
              </PopoverTrigger>
              <PopoverContent className="z-50 w-fit p-0">
                <EmojiPicker
                  className="h-[326px] rounded-lg shadow-md"
                  onEmojiSelect={({ emoji }) => {
                    dispatch(projectsSlice.update(project.id, { icon: emoji }));
                  }}
                >
                  <EmojiPickerSearch />
                  <EmojiPickerContent />
                </EmojiPicker>
              </PopoverContent>
            </Popover>

            <button
              type="button"
              onClick={handleTitleClick}
              className="flex-1 min-w-0 text-left cursor-pointer"
            >
              <h1 className="text-3xl font-bold text-content leading-tight hover:text-primary transition-colors">
                {project.title}
              </h1>
            </button>

            <div className="flex self-center flex-shrink-0">
              <button
                onClick={handleDeleteClick}
                type="button"
                className="cursor-pointer text-content-tinted hover:text-notice transition-colors flex justify-center items-center"
              >
                <DeleteIcon />
              </button>
            </div>
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
        <div className="flex flex-1 min-h-0 overflow-x-auto pb-4">
          <div className="min-w-max h-full px-4">
            <ProjectItemsList project={project} />
          </div>
        </div>
      )}
    </div>
  );
};

export const ProjectDetailView = ({ projectId }: { projectId: string }) => {
  const inboxProjectId = useSyncSelector(
    () => projectsSlice.inboxProjectId(),
    [],
  );
  const realProjectId = useMemo(() => {
    return projectId === "inbox" ? inboxProjectId : projectId;
  }, [projectId, inboxProjectId]);

  return <ProjectDetailContent projectId={realProjectId} />;
};

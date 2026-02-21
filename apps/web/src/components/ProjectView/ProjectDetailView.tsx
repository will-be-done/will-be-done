import { useDispatch, useSyncSelector } from "@will-be-done/hyperdb";
import { useSidebarStore } from "@/store/sidebarStore.ts";
import { projectsSlice } from "@will-be-done/slices/space";
import { ProjectTaskPanel } from "@/components/DateView/ProjectTaskPanel.tsx";
import { DateViewSidebar } from "@/components/DateView/DateViewSidebar.tsx";
import { Link } from "@tanstack/react-router";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import {
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerSearch,
} from "@/components/ui/emoji-picker.tsx";

const EditIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    width="13"
    height="13"
    viewBox="0 0 12 13"
  >
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M11.136 3.357a1.527 1.527 0 1 0-2.16-2.16l-7.228 7.23c-.126.126-.22.28-.271.45L.76 11.235a.27.27 0 0 0 .338.337l2.358-.715c.17-.052.324-.144.45-.27l7.229-7.23Z"
    />
  </svg>
);

const DeleteIcon = () => (
  <svg width="13" height="13" viewBox="0 0 12 13" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M9.41667 2.91667V10.5C9.41667 10.7873 9.30253 11.0629 9.09937 11.266C8.8962 11.4692 8.62065 11.5833 8.33333 11.5833H2.91667C2.62935 11.5833 2.3538 11.4692 2.15063 11.266C1.94747 11.0629 1.83333 10.7873 1.83333 10.5V2.91667M0.75 2.91667H10.5M3.45833 2.91667V1.83333C3.45833 1.54602 3.57247 1.27047 3.77563 1.0673C3.9788 0.864137 4.25435 0.75 4.54167 0.75H6.70833C6.99565 0.75 7.2712 0.864137 7.47437 1.0673C7.67753 1.27047 7.79167 1.54602 7.79167 1.83333V2.91667"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ProjectDetailContent = ({ projectId }: { projectId: string }) => {
  const dispatch = useDispatch();
  const project = useSyncSelector(
    () => projectsSlice.byIdOrDefault(projectId),
    [projectId],
  );

  const handleEditClick = () => {
    const newTitle = prompt("Enter new project title", project.title);
    if (newTitle == "" || newTitle == null) return;
    dispatch(projectsSlice.update(project.id, { title: newTitle }));
  };

  const handleDeleteClick = () => {
    const shouldDelete = confirm(
      "Are you sure you want to delete this project?",
    );
    if (shouldDelete) {
      dispatch(projectsSlice.delete([project.id]));
    }
  };

  return (
    <div className="mt-5">
      {/* Project header */}
      <div className="flex items-start gap-3 mb-6 group">
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

        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-bold text-content leading-tight">
            {project.title}
          </h1>
        </div>

        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-2">
          <button
            onClick={handleEditClick}
            type="button"
            className="cursor-pointer text-content-tinted hover:text-primary transition-colors flex justify-center items-center"
          >
            <EditIcon />
          </button>
          <button
            onClick={handleDeleteClick}
            type="button"
            className="cursor-pointer text-content-tinted hover:text-notice transition-colors flex justify-center items-center"
          >
            <DeleteIcon />
          </button>
        </div>
      </div>

      {/* Task list */}
      <ProjectTaskPanel projectId={projectId} embedded />
    </div>
  );
};

export const ProjectDetailView = ({ projectId }: { projectId: string }) => {
  const sidebarWidth = useSidebarStore((s) => s.width);
  const setSidebarWidth = useSidebarStore((s) => s.setWidth);

  return (
    <SidebarProvider
      defaultOpen={true}
      className="min-h-0 h-full w-full"
      width={sidebarWidth}
      onWidthChange={setSidebarWidth}
    >
      <DateViewSidebar />
      <SidebarInset className="min-h-0 bg-transparent">
        <div className="relative h-full">
          <SidebarTrigger className="absolute left-2 top-2 z-20 text-content-tinted hover:text-primary backdrop-blur-md cursor-pointer" />
          <div className="overflow-y-auto h-full">
            <div className="max-w-lg mx-auto px-4 py-4">
              <ProjectDetailContent projectId={projectId} />
            </div>
          </div>
          <div className="absolute right-0 top-0">
            <div className="flex items-center rounded-bl-lg text-[13px] bg-surface-elevated/70 backdrop-blur-md ring-1 ring-ring text-content-tinted h-8 px-3 gap-4">
              <Link className="transition-colors hover:text-primary" to="/spaces">
                spaces
              </Link>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

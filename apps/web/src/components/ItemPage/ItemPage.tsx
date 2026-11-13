import { ChevronRight, Link2, X } from "lucide-react";
import { toast } from "sonner";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useAsyncSelector, useSelectAsync } from "@will-be-done/hyperdb/react";
import {
  isNote,
  isTaskTemplate,
  type Item,
  projectOfProjectSectionOrDefault,
  projectSectionById,
  projectSectionItemById,
} from "@will-be-done/slices/space";
import { ItemDetailsBody } from "@/components/ItemDetails/ItemDetails.tsx";
import { useItemDetailsEditing } from "@/components/ItemDetails/useItemDetailsEditing.ts";
import { DetailsVariantProvider } from "@/components/ItemDetails/detailsVariant.ts";
import { useGlobalListener } from "@/components/GlobalListener/hooks.tsx";
import { GlobalLayout } from "@/components/Layout/GlobalLayout.tsx";
import { LayoutWithSidebar } from "@/components/Layout/LayoutWithSidebar";
import { ProjectIcon } from "@/components/ui/emoji";
import { useOpenProject } from "@/hooks/useOpenProject.ts";
import { Route as SpaceRoute } from "@/routes/spaces.$spaceId.tsx";
import { isEditingText } from "@/utils/isEditingText";
import { useOpenItemPage } from "./useOpenItemPage.ts";

const kindLabel = (item: Item) =>
  isNote(item) ? "Note" : isTaskTemplate(item) ? "Repeating task" : "Task";

export function ItemPage({ itemId }: { itemId: string }) {
  const { spaceId } = SpaceRoute.useParams();
  const navigate = useNavigate();
  const router = useRouter();
  const select = useSelectAsync();
  const openProject = useOpenProject();
  const openItemPage = useOpenItemPage();
  const { data: item } = useAsyncSelector({
    selector: projectSectionItemById,
    args: { id: itemId },
  });
  const { data: project } = useAsyncSelector({
    selector: projectOfProjectSectionOrDefault,
    args: { projectSectionId: item?.projectSectionId ?? "" },
    enabled: !!item,
  });
  const editing = useItemDetailsEditing(itemId);

  const close = () => {
    if (router.history.canGoBack()) {
      router.history.back();
    } else if (project) {
      openProject(project.id);
    } else {
      void navigate({ to: "/spaces/$spaceId/dates", params: { spaceId } });
    }
  };

  useGlobalListener("keydown", (e: KeyboardEvent) => {
    if (
      e.key !== "Escape" ||
      e.defaultPrevented ||
      editing.isEditingAnyField ||
      isEditingText(e.target) ||
      e.target instanceof HTMLSelectElement ||
      document.querySelector('[role="dialog"], [role="menu"]')
    ) {
      return;
    }
    close();
  });

  // Converting between a task and a note replaces the row with a new ID.
  const handleItemIdChange = (nextItemId: string) => {
    void (async () => {
      const next = await select({
        selector: projectSectionItemById,
        args: { id: nextItemId },
      });
      if (next) openItemPage(next, { replace: true });
    })();
  };

  const copyLink = () => {
    void navigator.clipboard.writeText(window.location.href).then(() => {
      toast("Link copied");
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-task-panel-divider pl-12 pr-3">
        {item && <Breadcrumb item={item} />}
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <HeaderButton label="Copy link" onClick={copyLink}>
            <Link2 className="h-4 w-4" />
          </HeaderButton>
          <HeaderButton label="Close" onClick={close}>
            <X className="h-4 w-4" />
          </HeaderButton>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {item ? (
          <DetailsVariantProvider value="page">
            <ItemDetailsBody
              item={item}
              isEditingTitle={editing.isEditingTitle}
              setIsEditingTitle={editing.setIsEditingTitle}
              isEditingDescription={editing.isEditingDescription}
              setIsEditingDescription={editing.setIsEditingDescription}
              onItemIdChange={handleItemIdChange}
            />
          </DetailsVariantProvider>
        ) : (
          <div className="flex h-60 flex-col items-center justify-center gap-3 px-4 text-center text-sm text-content-tinted">
            This item was deleted or never existed.
            <button
              type="button"
              onClick={close}
              className="cursor-pointer rounded-md px-3 py-1.5 text-content ring-1 ring-ring transition-colors hover:bg-task-panel-hover"
            >
              Go back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Breadcrumb({ item }: { item: Item }) {
  const openProject = useOpenProject();
  const { data: project } = useAsyncSelector({
    selector: projectOfProjectSectionOrDefault,
    args: { projectSectionId: item.projectSectionId },
  });
  const { data: section } = useAsyncSelector({
    selector: projectSectionById,
    args: { id: item.projectSectionId },
  });
  const separator = (
    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-content-tinted/50" />
  );

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 items-center gap-1 text-[13px]"
    >
      {project && (
        <button
          type="button"
          onClick={() => openProject(project.id)}
          className="flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-content-tinted transition-colors hover:bg-task-panel-hover hover:text-content"
        >
          <span className="shrink-0 text-xs leading-none">
            <ProjectIcon icon={project.icon} />
          </span>
          <span className="truncate">{project.title}</span>
        </button>
      )}
      {section?.title && (
        <>
          {separator}
          <span className="truncate px-1.5 text-content-tinted">
            {section.title}
          </span>
        </>
      )}
      {separator}
      <span className="shrink-0 px-1.5 text-content">{kindLabel(item)}</span>
    </nav>
  );
}

function HeaderButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-content-tinted transition-colors hover:bg-task-panel-hover hover:text-content"
    >
      {children}
    </button>
  );
}

export function ItemPageScreen({ itemId }: { itemId: string }) {
  return (
    <GlobalLayout>
      <LayoutWithSidebar>
        <ItemPage itemId={itemId} />
      </LayoutWithSidebar>
    </GlobalLayout>
  );
}

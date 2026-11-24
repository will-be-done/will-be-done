import { Suspense, useRef } from "react";
import { ChevronRight, Link2, Maximize2, X } from "lucide-react";
import { toast } from "sonner";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useAsyncSelector } from "@will-be-done/hyperdb/react";
import {
  isNote,
  isTask,
  isTaskTemplate,
  type Item,
  projectOfProjectSectionOrDefault,
  projectSectionById,
  projectSectionItemById,
} from "@will-be-done/slices/space";
import { ItemDetailsBody } from "@/components/ItemDetails/ItemDetails.tsx";
import { useItemDetailsEditing } from "@/components/ItemDetails/useItemDetailsEditing.ts";
import { DetailsVariantProvider } from "@/components/ItemDetails/detailsVariant.ts";
import { AttachmentDropZone } from "@/components/Attachments/AttachmentDropZone.tsx";
import { useGlobalListener } from "@/components/GlobalListener/hooks.tsx";
import { GlobalLayout } from "@/components/Layout/GlobalLayout.tsx";
import { LayoutWithSidebar } from "@/components/Layout/LayoutWithSidebar";
import { ProjectIcon } from "@/components/ui/emoji";
import { ScrollArea } from "@/components/ui/scroll-area";
import { promptDialog } from "@/components/ui/prompt-dialog-service";
import { useOpenProject } from "@/hooks/useOpenProject.ts";
import { Route as SpaceRoute } from "@/routes/spaces.$spaceId.tsx";
import { isEditingText } from "@/utils/isEditingText";
import { cn } from "@/lib/utils";
import { useItemReplacement } from "@/components/ItemDetails/useItemReplacement.ts";
import { itemPageLocation, useOpenItemPage } from "./useOpenItemPage.ts";

const kindLabel = (item: Item) =>
  isNote(item) ? "Note" : isTaskTemplate(item) ? "Repeating task" : "Task";

function copyWithSelection(text: string) {
  const previousFocus = document.activeElement;
  const field = document.createElement("textarea");
  field.value = text;
  field.readOnly = true;
  field.tabIndex = -1;
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  try {
    field.focus({ preventScroll: true });
    field.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
    if (previousFocus instanceof HTMLElement) {
      previousFocus.focus({ preventScroll: true });
    }
  }
}

async function copyLink(link: string) {
  const clipboard = navigator.clipboard;
  const copied = clipboard?.writeText
    ? await clipboard.writeText(link).then(
        () => true,
        () => false,
      )
    : false;
  if (copied || copyWithSelection(link)) {
    toast("Link copied");
  } else {
    void promptDialog("Copy this link", link);
  }
}

// The panel tokens are tinted for the side panel's warm background; a full
// page or popup sits on the neutral app surface.
const neutralSurface =
  "[--color-task-panel-divider:oklch(100%_0_none/0.08)] [--color-task-panel-hover:oklch(100%_0_none/0.06)] [--color-task-panel-ring:oklch(100%_0_none/0.14)]";

export function ItemView({
  itemId,
  onClose,
  onItemIdChange,
  isPopup = false,
}: {
  itemId: string;
  onClose: () => void;
  onItemIdChange: (item: Item) => void;
  isPopup?: boolean;
}) {
  const { spaceId } = SpaceRoute.useParams();
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const { data: loaded, isPending } = useAsyncSelector({
    selector: projectSectionItemById,
    args: { id: itemId },
  });
  const { item, replaceItem } = useItemReplacement(loaded, onItemIdChange);
  const editing = useItemDetailsEditing(itemId);
  const pageLocation = item && itemPageLocation(spaceId, item);

  useGlobalListener("keydown", (e: KeyboardEvent) => {
    if (
      e.key !== "Escape" ||
      e.defaultPrevented ||
      editing.isEditingAnyField ||
      isEditingText(e.target) ||
      e.target instanceof HTMLSelectElement ||
      Array.from(
        document.querySelectorAll('[role="dialog"], [role="menu"]'),
      ).some((el) => el !== rootRef.current)
    ) {
      return;
    }
    onClose();
  });

  return (
    <div
      ref={rootRef}
      {...(isPopup && {
        role: "dialog",
        "aria-modal": true,
        "aria-label": item?.title || "Item",
      })}
      className={cn("flex h-full min-h-0 flex-col", neutralSurface)}
    >
      <header
        className={cn(
          "flex h-12 shrink-0 items-center gap-2 border-b border-task-panel-divider pr-3",
          isPopup ? "pl-3" : "pl-12",
        )}
      >
        {item && <Breadcrumb item={item} />}
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {isPopup && pageLocation && (
            <Link
              {...pageLocation}
              title="Open as page"
              aria-label="Open as page"
              className={headerButtonClass}
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Link>
          )}
          {pageLocation && (
            <HeaderButton
              label="Copy link"
              onClick={() =>
                void copyLink(
                  new URL(
                    router.buildLocation(pageLocation).href,
                    window.location.origin,
                  ).href,
                )
              }
            >
              <Link2 className="h-4 w-4" />
            </HeaderButton>
          )}
          <HeaderButton label="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </HeaderButton>
        </div>
      </header>

      <AttachmentDropZone
        parent={item ? { parentType: item.type, parentId: item.id } : undefined}
        className="min-h-0 flex-1"
      >
        <ScrollArea rootClassName="h-full" className="overscroll-contain">
          {item ? (
            <DetailsVariantProvider value="page">
              <ItemDetailsBody
                item={item}
                isEditingTitle={editing.isEditingTitle}
                setIsEditingTitle={editing.setIsEditingTitle}
                isEditingDescription={editing.isEditingDescription}
                setIsEditingDescription={editing.setIsEditingDescription}
                replaceItem={replaceItem}
              />
            </DetailsVariantProvider>
          ) : isPending ? null : (
            <div className="flex h-60 flex-col items-center justify-center gap-3 px-4 text-center text-sm text-content-tinted">
              This item was deleted or never existed.
              <button
                type="button"
                onClick={onClose}
                className="cursor-pointer rounded-md px-3 py-1.5 text-content ring-1 ring-ring transition-colors hover:bg-task-panel-hover"
              >
                Go back
              </button>
            </div>
          )}
        </ScrollArea>
      </AttachmentDropZone>
    </div>
  );
}

function ItemPage({ itemId }: { itemId: string }) {
  const { spaceId } = SpaceRoute.useParams();
  const navigate = useNavigate();
  const router = useRouter();
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

  const close = () => {
    if (router.history.canGoBack()) {
      router.history.back();
    } else if (project) {
      openProject(project.id);
    } else {
      void navigate({ to: "/spaces/$spaceId/dates", params: { spaceId } });
    }
  };

  return (
    <ItemView
      itemId={itemId}
      onClose={close}
      onItemIdChange={(next) => openItemPage(next, { replace: true })}
    />
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
          onClick={() =>
            openProject(project.id, isTask(item) ? item : undefined)
          }
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

const headerButtonClass =
  "flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-content-tinted transition-colors hover:bg-task-panel-hover hover:text-content";

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
      className={headerButtonClass}
    >
      {children}
    </button>
  );
}

export function ItemPageScreen({ itemId }: { itemId: string }) {
  return (
    <GlobalLayout>
      <LayoutWithSidebar>
        {/* Keeps a read the loader missed from blanking the whole layout. */}
        <Suspense fallback={null}>
          <ItemPage itemId={itemId} />
        </Suspense>
      </LayoutWithSidebar>
    </GlobalLayout>
  );
}

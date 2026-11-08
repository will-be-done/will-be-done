import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { ItemDetailsPage } from "@/components/ItemDetails/ItemDetails.tsx";
import { GlobalLayout } from "@/components/Layout/GlobalLayout.tsx";
import { preloadSelectorAsync } from "@will-be-done/hyperdb";
import {
  itemExists,
  checklistItemChildren,
  dailyEntryDateOfTask,
  isTask,
  isTaskTemplate,
  isNote,
  projectSectionsByProjectId,
  projectSectionItemById,
  projectOfProjectSectionOrDefault,
  taskTemplateById,
  taskTemplateRuleText,
} from "@will-be-done/slices/space";

export const Route = createFileRoute("/spaces/$spaceId/item-details/$itemId")({
  component: RouteComponent,
  loader: async ({ context, params }) => {
    const db = await context.spaceDbPromise;
    const promises: Promise<unknown>[] = [];
    const appendPromise = (promise: Promise<unknown>) => {
      promises.push(promise);
    };

    appendPromise(
      preloadSelectorAsync(db, {
        selector: itemExists,
        args: { id: params.itemId },
      }),
    );

    const item = await preloadSelectorAsync(db, {
      selector: projectSectionItemById,
      args: { id: params.itemId },
    });

    if (!item) {
      await Promise.all(promises);
      return;
    }

    if (!isNote(item)) {
      appendPromise(
        preloadSelectorAsync(db, {
          selector: checklistItemChildren,
          args: { parentId: item.id, parentType: item.type },
        }),
      );
    }

    const project = await preloadSelectorAsync(db, {
      selector: projectOfProjectSectionOrDefault,
      args: { projectSectionId: item.projectSectionId },
    });

    appendPromise(
      preloadSelectorAsync(db, {
        selector: projectSectionsByProjectId,
        args: { projectId: project.id },
      }),
    );

    if (isTask(item)) {
      appendPromise(
        preloadSelectorAsync(db, {
          selector: dailyEntryDateOfTask,
          args: { taskId: item.id },
        }),
      );

      if (item.templateId) {
        appendPromise(
          preloadSelectorAsync(db, {
            selector: taskTemplateById,
            args: { id: item.templateId },
          }),
        );
        appendPromise(
          preloadSelectorAsync(db, {
            selector: taskTemplateRuleText,
            args: { id: item.templateId },
          }),
        );
      }
    }

    if (isTaskTemplate(item)) {
      appendPromise(
        preloadSelectorAsync(db, {
          selector: taskTemplateRuleText,
          args: { id: item.id },
        }),
      );
    }

    await Promise.all(promises);
  },
});

function RouteComponent() {
  const { itemId, spaceId } = Route.useParams();
  const navigate = useNavigate();
  const router = useRouter();

  const handleBack = () => {
    if (router.history.canGoBack()) {
      router.history.back();
      return;
    }

    void navigate({
      to: "/spaces/$spaceId/dates",
      params: { spaceId },
    });
  };

  const handleItemIdChange = (nextItemId: string) => {
    void navigate({
      to: "/spaces/$spaceId/item-details/$itemId",
      params: { spaceId, itemId: nextItemId },
      replace: true,
    });
  };

  return (
    <GlobalLayout>
      <main className="flex min-h-0 w-full justify-center">
        <ItemDetailsPage
          itemId={itemId}
          onBack={handleBack}
          onItemIdChange={handleItemIdChange}
        />
      </main>
    </GlobalLayout>
  );
}

import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { CardDetailsPage } from "@/components/CardDetails/CardDetails.tsx";
import { GlobalLayout } from "@/components/Layout/GlobalLayout.tsx";
import { preloadSelectorAsync } from "@will-be-done/hyperdb";
import {
  cardExists,
  checklistItemChildren,
  dailyProjectionDateOfTask,
  isTask,
  isTaskTemplate,
  projectSectionsByProjectId,
  projectSectionCardById,
  projectOfProjectSectionOrDefault,
  taskTemplateById,
  taskTemplateRuleText,
} from "@will-be-done/slices/space";

export const Route = createFileRoute("/spaces/$spaceId/card-details/$cardId")({
  component: RouteComponent,
  loader: async ({ context, params }) => {
    const db = await context.spaceDbPromise;
    const promises: Promise<unknown>[] = [];
    const appendPromise = (promise: Promise<unknown>) => {
      promises.push(promise);
    };

    appendPromise(
      preloadSelectorAsync(db, {
        selector: cardExists,
        args: { id: params.cardId },
      }),
    );

    const card = await preloadSelectorAsync(db, {
      selector: projectSectionCardById,
      args: { id: params.cardId },
    });

    if (!card) {
      await Promise.all(promises);
      return;
    }

    appendPromise(
      preloadSelectorAsync(db, {
        selector: checklistItemChildren,
        args: { parentId: card.id, parentType: card.type },
      }),
    );

    const project = await preloadSelectorAsync(db, {
      selector: projectOfProjectSectionOrDefault,
      args: { projectSectionId: card.projectSectionId },
    });

    appendPromise(
      preloadSelectorAsync(db, {
        selector: projectSectionsByProjectId,
        args: { projectId: project.id },
      }),
    );

    if (isTask(card)) {
      appendPromise(
        preloadSelectorAsync(db, {
          selector: dailyProjectionDateOfTask,
          args: { taskId: card.id },
        }),
      );

      if (card.templateId) {
        appendPromise(
          preloadSelectorAsync(db, {
            selector: taskTemplateById,
            args: { id: card.templateId },
          }),
        );
        appendPromise(
          preloadSelectorAsync(db, {
            selector: taskTemplateRuleText,
            args: { id: card.templateId },
          }),
        );
      }
    }

    if (isTaskTemplate(card)) {
      appendPromise(
        preloadSelectorAsync(db, {
          selector: taskTemplateRuleText,
          args: { id: card.id },
        }),
      );
    }

    await Promise.all(promises);
  },
});

function RouteComponent() {
  const { cardId, spaceId } = Route.useParams();
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

  const handleCardIdChange = (nextCardId: string) => {
    void navigate({
      to: "/spaces/$spaceId/card-details/$cardId",
      params: { spaceId, cardId: nextCardId },
      replace: true,
    });
  };

  return (
    <GlobalLayout>
      <main className="flex min-h-0 w-full justify-center">
        <CardDetailsPage
          cardId={cardId}
          onBack={handleBack}
          onCardIdChange={handleCardIdChange}
        />
      </main>
    </GlobalLayout>
  );
}

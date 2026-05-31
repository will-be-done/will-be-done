import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CardDetailsPage } from "@/components/CardDetails/CardDetails.tsx";
import { GlobalLayout } from "@/components/Layout/GlobalLayout.tsx";

export const Route = createFileRoute("/spaces/$spaceId/card-details/$cardId")({
  component: RouteComponent,
});

function RouteComponent() {
  const { cardId, spaceId } = Route.useParams();
  const navigate = useNavigate();

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    void navigate({
      to: "/spaces/$spaceId/dates",
      params: { spaceId },
    });
  };

  return (
    <GlobalLayout>
      <main className="flex min-h-0 w-full justify-center">
        <CardDetailsPage cardId={cardId} onBack={handleBack} />
      </main>
    </GlobalLayout>
  );
}

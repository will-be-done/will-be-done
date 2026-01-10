import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/spaces")({
  component: RouteComponent,
});

function RouteComponent() {
  return <Outlet />;
}

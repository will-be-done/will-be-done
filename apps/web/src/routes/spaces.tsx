import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/spaces")({
  component: RouteComponent,
  head: () => ({
    meta: [{ title: "Will Be Done" }],
  }),
});

function RouteComponent() {
  return <Outlet />;
}

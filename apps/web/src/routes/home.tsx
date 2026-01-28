import { LandingPage } from "@/components/Landing/Landing";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/home")({
  component: LandingPage,
});

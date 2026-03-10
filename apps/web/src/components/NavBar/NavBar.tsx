import { SpaceNavLinks } from "@/components/SpaceNavLinks.tsx";

export const NavBar = ({ spaceId }: { spaceId: string }) => {
  return (
    <div className="flex items-center gap-0.5 h-8 px-1.5 bg-surface-elevated ring-1 ring-ring rounded-br-lg">
      <SpaceNavLinks spaceId={spaceId} />
    </div>
  );
};

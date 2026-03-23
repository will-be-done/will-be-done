import { SpaceNavLinks } from "@/components/SpaceNavLinks.tsx";

export const NavBar = ({ spaceId }: { spaceId: string }) => {
  return (
    <div className="flex">
      <SpaceNavLinks spaceId={spaceId} />
    </div>
  );
};

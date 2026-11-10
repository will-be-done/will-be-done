import { useAsyncSelector } from "@will-be-done/hyperdb/react";
import { projectOfProjectSectionOrDefault } from "@will-be-done/slices/space";
import { getProjectCardStyle } from "@/lib/projectColors";

export function useProjectCardAppearance(projectSectionId: string | undefined) {
  const { data: project } = useAsyncSelector({
    selector: projectOfProjectSectionOrDefault,
    args: { projectSectionId: projectSectionId ?? "" },
    enabled: !!projectSectionId,
  });
  return {
    project: projectSectionId ? project : undefined,
    style: projectSectionId ? getProjectCardStyle(project) : undefined,
  };
}

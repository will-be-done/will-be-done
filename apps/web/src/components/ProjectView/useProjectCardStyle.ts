import { useAsyncSelector } from "@will-be-done/hyperdb/react";
import { projectOfProjectSectionOrDefault } from "@will-be-done/slices/space";
import { getProjectCardStyle } from "@/lib/projectColors";

export function useProjectCardStyle(projectSectionId: string | undefined) {
  const { data: project } = useAsyncSelector({
    selector: projectOfProjectSectionOrDefault,
    args: { projectSectionId: projectSectionId ?? "" },
    enabled: !!projectSectionId,
  });
  return projectSectionId ? getProjectCardStyle(project) : undefined;
}

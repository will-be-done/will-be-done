import { observer } from "mobx-react-lite";
import { useParams } from "wouter";
import { ProjectItemsList } from "../../components/ProjectItemsList/ProjectItemsList";
import { getRootStore } from "@/models/initRootStore";

export const ProjectPage = observer(function ProjectPageComp() {
  const params = useParams<{ projectId: string }>();
  const { projectsRegistry: projectRegistry } = getRootStore();
  const project =
    params.projectId == "inbox"
      ? projectRegistry.inboxProjectOrThrow
      : projectRegistry.getById(params.projectId);

  if (!project) {
    return <div>Project not found</div>;
  }

  return <ProjectItemsList project={project} />;
});

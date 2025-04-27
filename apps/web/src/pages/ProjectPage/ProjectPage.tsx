import { observer } from "mobx-react-lite";
import { useParams } from "wouter";
import { ProjectItemsList } from "../../components/ProjectItemsList/ProjectItemsList";
import {
  Project,
  projectsListSelectors,
  projectsSelectors,
} from "@/models/models2";
import { useAppSelector } from "@/hooks/state";

export const ProjectPage = observer(function ProjectPageComp() {
  const params = useParams<{ projectId: string }>();
  const project = useAppSelector((state): Project => {
    if (params.projectId == "inbox") {
      return projectsListSelectors.inbox(state);
    }

    return projectsSelectors.byIdOrDefault(state, params.projectId);
  });

  if (!project) {
    return <div>Project not found</div>;
  }

  return <ProjectItemsList project={project} />;
});

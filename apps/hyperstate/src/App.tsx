import { useCallback, useState } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";
import "./App.css";
import { useDispatch, useSelector } from "./react/hooks";
import {
  projectsActions,
  projectsListSelectors,
  projectsSelectors,
  RootState,
} from "./models";
import { Select } from "./state";

function useAppSelector<TStateSlice>(
  selector: (state: RootState, select: Select<RootState>) => TStateSlice,
) {
  return useSelector(selector);
}

function useAppDispatch() {
  return useDispatch<RootState>();
}

const Project = ({ id }: { id: string }) => {
  const project = useAppSelector(projectsSelectors.getById(id));
  const dispatch = useAppDispatch();

  return (
    <div>
      <h2>{project.title}</h2>
      <button
        onClick={() => {
          dispatch(
            projectsActions.update({
              ...project,
              title: "Project " + Math.random().toString(36).slice(2),
            }),
          );
        }}
      >
        Update
      </button>
    </div>
  );
};
function App() {
  const [count, setCount] = useState(0);

  const projectIds = useAppSelector(
    projectsListSelectors.getSortedProjectIds(),
  );
  const dispatch = useAppDispatch();

  const updateProject = useCallback(() => {
    dispatch(
      projectsActions.update({
        id: "2",
        title: "Project 1" + Math.random().toString(36).slice(2),
        orderToken: "1",
        type: "project",
      }),
    );
  }, [dispatch]);

  const insertMillion = useCallback(() => {
    dispatch(projectsActions.insertMillion());
  }, [dispatch]);

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <button
          onClick={() => {
            const id = Math.random().toString(36).slice(2);
            dispatch(
              projectsActions.create({
                id: id,
                title: "Project " + id,
                orderToken: id,
                type: "project",
              }),
            );
          }}
        >
          Create project
        </button>
        <button onClick={insertMillion}>Insert million</button>
        <button onClick={updateProject}>Update project</button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <div>
        {projectIds.map((id) => (
          <Project key={id} id={id} />
        ))}
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  );
}

export default App;

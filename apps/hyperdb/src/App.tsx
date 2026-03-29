import { useCallback, useState } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";
import "./App.css";
import { useAsyncSelector, useAsyncDispatch } from "./react/hooks";
import { create, getAllProjects, getById, insertMillion, update } from "./db";
import { useDB } from "./react/context";

const Project = ({ id }: { id: string }) => {
  const project = useAsyncSelector(() => getById(id), [id]);
  const db = useDB();

  if (!project) return <div>Loading...</div>;

  return (
    <div>
      <h2>{project.title}</h2>
      <button
        onClick={() => {
          void update(db, {
            ...project,
            title: "Project " + Math.random().toString(36).slice(2),
          });
        }}
      >
        Update
      </button>
    </div>
  );
};

const SortedProjects = () => {
  const projects = useAsyncSelector(() => getAllProjects(), []);
  const projectIds = projects?.map((p) => p.id).slice(0, 10) ?? [];

  console.log("projects", projects);
  return (
    <div>
      {projectIds.map((id) => (
        <Project key={id} id={id} />
      ))}
    </div>
  );
};

function App() {
  const [count, setCount] = useState(0);
  const db = useDB();
  const dispatch = useAsyncDispatch();

  const insert = useCallback(() => {
    void dispatch(insertMillion());
  }, [dispatch]);

  const updateProject = useCallback(() => {
    void update(db, {
      id: "2",
      title: "Project 1" + Math.random().toString(36).slice(2),
      orderToken: "1",
      type: "project",
    });
  }, [db]);

  const [isHidden, setIsHidden] = useState(false);

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

      <button
        onClick={() => {
          const id = Math.random().toString(36).slice(2);
          void create(db, {
            id: id,
            title: "Project " + id,
            orderToken: id,
            type: "project",
          });
        }}
      >
        Create project
      </button>
      <button onClick={insert}>Insert million</button>
      <button onClick={updateProject}>Update project</button>
      <h1>Vite + React</h1>

      <button onClick={() => setIsHidden((v) => !v)}>Toggle hidden</button>

      {!isHidden && <SortedProjects />}

      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  );
}

export default App;

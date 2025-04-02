import "./fixGlobal";
import { Board } from "./components/DaysBoard/DaysBoard";
import { getRootStore } from "./models/models";
import { observer } from "mobx-react-lite";

export const App = observer(function App() {
  const rootStore = getRootStore();

  console.log(rootStore);

  return (
    <>
      <Board />
    </>
  );
});

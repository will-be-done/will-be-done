import "./fixGlobal";
import { DaysView } from "./components/DaysView";
import { getRootStore } from "./models/models";
import { observer } from "mobx-react-lite";

export const App = observer(function App() {
  const rootStore = getRootStore();

  console.log(rootStore);

  return (
    <>
      <DaysView />
    </>
  );
});

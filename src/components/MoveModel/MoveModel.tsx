import {
  Description,
  Dialog,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";

import { observer } from "mobx-react-lite";
import { getRootStore } from "../../models/models";

export const MoveModal = observer(function MoveModelComp({
  isOpen,
  setIsOpen,
  handleMove,
  exceptProjectId,
}: {
  isOpen: boolean;
  setIsOpen: (val: boolean) => void;
  handleMove: (projectId: string) => void;
  exceptProjectId: string;
}) {
  const { allProjectsList } = getRootStore();

  const projects = allProjectsList.children.filter(
    (pr) => pr.id !== exceptProjectId,
  );
  return (
    <Dialog
      static
      className="relative z-50"
      open
      onClose={() => setIsOpen(!isOpen)}
    >
      <div className="fixed inset-0 bg-black/60" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="mx-auto flex max-h-[80vh] w-full max-w-3xl flex-col rounded-2xl bg-gray-800 p-5 shadow-xl ">
          <DialogTitle
            className="mb-3 border-b pb-2 text-lg font-medium leading-6 text-gray-200"
            as="h3"
          >
            Choose project
          </DialogTitle>
          <Description className="h-full min-h-0 overflow-y-scroll" as="div">
            <div className="grid gap-1 overflow-y-scroll text-gray-200">
              {projects.map((pr) => (
                <button
                  key={pr.id}
                  className="mx-2 cursor-pointer rounded bg-gray-900 p-3 text-left hover:bg-sky-900"
                  onClick={() => handleMove(pr.id)}
                >
                  {pr.title}
                </button>
              ))}
            </div>
          </Description>
        </DialogPanel>
      </div>
    </Dialog>
  );
});

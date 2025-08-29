import {
  Description,
  Dialog,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";

import { useState, useRef, useEffect, useMemo } from "react";
import { useUnmount } from "../../utils";
import { useAppStore } from "@/hooks/stateHooks.ts";
import { focusSlice } from "@/store/slices/focusSlice.ts";
import { useSyncSelector } from "@will-be-done/hyperdb";
import { allProjectsSlice2 } from "@will-be-done/slices";

export const MoveModal = ({
  setIsOpen,
  handleMove,
  exceptProjectId,
}: {
  setIsOpen: (val: boolean) => void;
  handleMove: (projectId: string) => void;
  exceptProjectId: string;
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const allProjects = useSyncSelector(() => allProjectsSlice2.allSorted(), []);

  const projects = useMemo(() => {
    return allProjects
      .filter((pr) => pr.id !== exceptProjectId)
      .filter((pr) =>
        pr.title.toLowerCase().includes(searchQuery.toLowerCase()),
      );
  }, [allProjects, searchQuery, exceptProjectId]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || (e.ctrlKey && e.code === "KeyJ")) {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev < projects.length - 1 ? prev + 1 : prev,
      );
    } else if (e.key === "ArrowUp" || (e.ctrlKey && e.code === "KeyK")) {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === "Enter" && projects[selectedIndex]) {
      e.preventDefault();
      setIsOpen(false);
      handleMove(projects[selectedIndex].id);
    }
  };

  const store = useAppStore();
  useEffect(() => {
    focusSlice.disableFocus(store);

    inputRef.current?.focus();
  }, [store]);

  useUnmount(() => {
    focusSlice.enableFocus(store);
  });

  return (
    <Dialog
      static
      className="relative z-50"
      open
      onClose={() => setIsOpen(false)}
      onKeyDown={handleKeyDown}
    >
      <div className="fixed inset-0 bg-black/60" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="mx-auto flex h-[70vh] w-full max-w-3xl flex-col rounded-2xl bg-gray-800 p-5 shadow-xl">
          <DialogTitle
            className="mb-3 border-b pb-2 text-lg font-medium leading-6 text-gray-200"
            as="h3"
          >
            Choose project
          </DialogTitle>
          <div className="mb-4">
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search projects..."
              className="w-full rounded bg-gray-900 p-2 text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
              autoFocus
            />
          </div>
          <Description className="flex-1 overflow-y-auto" as="div">
            <div className="grid gap-1 text-gray-200">
              {projects.map((pr, index) => (
                <button
                  key={pr.id}
                  className={`mx-2 cursor-pointer rounded p-3 text-left ${
                    index === selectedIndex
                      ? "bg-sky-900"
                      : "bg-gray-900 hover:bg-sky-900"
                  }`}
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
};

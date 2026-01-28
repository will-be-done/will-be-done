import {
  Description,
  Dialog,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useUnmount } from "../../utils";
import { focusSlice } from "@/store/focusSlice.ts";
import { useDispatch, useSyncSelector } from "@will-be-done/hyperdb";
import { projectsAllSlice } from "@will-be-done/slices/space";

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
  const allProjects = useSyncSelector(() => projectsAllSlice.allSorted(), []);

  const projects = useMemo(() => {
    return allProjects
      .filter((pr) => pr.id !== exceptProjectId)
      .filter((pr) =>
        pr.title.toLowerCase().includes(searchQuery.toLowerCase()),
      );
  }, [allProjects, searchQuery, exceptProjectId]);

  const updateSearchQuery = useCallback((data: string) => {
    setSelectedIndex(0);
    setSearchQuery(data);
  }, []);

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

  const dispatch = useDispatch();
  useEffect(() => {
    dispatch(focusSlice.disableFocus());

    inputRef.current?.focus();
  }, [dispatch]);

  useUnmount(() => {
    dispatch(focusSlice.enableFocus());
  });

  return (
    <Dialog
      static
      className="relative z-50"
      open
      onClose={() => setIsOpen(false)}
      onKeyDown={handleKeyDown}
    >
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="mx-auto flex h-[70vh] w-full max-w-3xl flex-col rounded-lg bg-popover p-5 ring-1 ring-ring backdrop-blur-xl">
          <DialogTitle
            className="mb-3 border-b border-ring pb-3 text-lg font-medium leading-6 text-primary"
            as="h3"
          >
            Choose project
          </DialogTitle>
          <div className="mb-4">
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => updateSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search projects..."
              className="w-full rounded bg-surface-elevated px-3 py-2.5 text-content placeholder-content-tinted-2 border border-ring transition-all focus:outline-none focus:border-accent"
              autoFocus
            />
          </div>
          <Description className="flex-1 overflow-y-auto" as="div">
            <div className="grid gap-1 text-content">
              {projects.map((pr, index) => (
                <button
                  key={pr.id}
                  type="button"
                  className={`cursor-pointer rounded px-3 py-2.5 text-left transition-colors ${
                    index === selectedIndex
                      ? "bg-accent/20 text-primary border border-accent"
                      : "border border-transparent hover:bg-panel-hover"
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

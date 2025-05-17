import { Link, useRoute } from "wouter";
import { getBackups, loadBackups, Backup } from "../../models/backup";
import { useRegisterFocusItem } from "@/hooks/useLists";
import { useGlobalListener } from "@/globalListener/hooks";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { ColumnListProvider } from "@/hooks/ParentListProvider";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import { preserveOffsetOnSource } from "@atlaskit/pragmatic-drag-and-drop/element/preserve-offset-on-source";
import { dropTargetForExternal } from "@atlaskit/pragmatic-drag-and-drop/external/adapter";
import {
  attachClosestEdge,
  type Edge,
  extractClosestEdge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import invariant from "tiny-invariant";
import { DndModelData, isModelDNDData } from "@/dnd/models";
import { cn } from "@/lib/utils";
import ReactDOM from "react-dom";
import { isInputElement } from "@/utils/isInputElement";
import { useAppSelector, useAppStore } from "@/hooks/state";
import { projectsSlice, allProjectsSlice } from "@/models/models2";
import { buildFocusKey, focusManager, focusSlice } from "@/states/FocusManager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { TaskSuggestions } from "../TaskSuggestions/TaskSuggestions";

export const Sidebar = function SidebarComp({
  children,
}: {
  children: React.ReactNode;
}) {
  const projectIdsWithoutInbox = useAppSelector(
    allProjectsSlice.childrenIdsWithoutInbox,
  );
  const store = useAppStore();

  const [isProjectsOpened] = useRoute("/projects/*");

  return (
    <ColumnListProvider
      focusKey={buildFocusKey("sidebar", "sidebar", "Sidebar")}
      priority="0"
    >
      {/* <Tabs defaultValue="projects" className="bg-gray-900 h-full w-full"> */}
      <div className="flex align-center justify-center w-full gap-2">
        <Link
          href="/projects/inbox"
          className={cn("text-white text-sm rounded-md border px-2 py-1", {
            "bg-gray-800": isProjectsOpened,
          })}
        >
          <span className="text-white text-sm">Projects</span>
        </Link>

        <Link
          href="/today"
          className={(active) =>
            cn("text-white text-sm rounded-md border px-2 py-1", {
              "bg-gray-800": active,
            })
          }
        >
          <span className="text-white text-sm">Days view</span>
        </Link>
      </div>
      <div className="overflow-y-hidden mb-4 mt-2">{children}</div>
      {/* <div className="flex align-center justify-center  w-full"> */}
      {/*   <TabsList> */}
      {/*     <TabsTrigger value="projects">Projects</TabsTrigger> */}
      {/*     <TabsTrigger value="suggestions">Suggestions</TabsTrigger> */}
      {/*   </TabsList> */}
      {/* </div> */}

      {/* <TabsContent value="suggestions" className="overflow-y-hidden mb-4"> */}
      {/*   <TaskSuggestions /> */}
      {/* </TabsContent> */}
      {/**/}
      {/* <TabsContent value="projects" className="overflow-y-hidden mb-4"> */}
      {/*   <div className="bg-gray-900 h-full flex flex-col"> */}
      {/*     <div className="px-2 py-1 flex-shrink-0"> */}
      {/*       <InboxItem /> */}
      {/*       <TodayItem /> */}
      {/*     </div> */}
      {/**/}
      {/*     <div className="mt-3 px-2 flex-1 min-h-0 overflow-hidden"> */}
      {/*       <div className="flex justify-between items-center mb-1 px-2"> */}
      {/*         <span className="text-gray-400 text-xs">My projects</span> */}
      {/*         <div className="flex"> */}
      {/*           <button */}
      {/*             className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center text-white cursor-pointer" */}
      {/*             onClick={createProject} */}
      {/*             title="Create new project" */}
      {/*           > */}
      {/*             <svg */}
      {/*               xmlns="http://www.w3.org/2000/svg" */}
      {/*               width="12" */}
      {/*               height="12" */}
      {/*               viewBox="0 0 24 24" */}
      {/*               fill="none" */}
      {/*               stroke="currentColor" */}
      {/*               strokeWidth="2" */}
      {/*               strokeLinecap="round" */}
      {/*               strokeLinejoin="round" */}
      {/*             > */}
      {/*               <line x1="12" y1="5" x2="12" y2="19" /> */}
      {/*               <line x1="5" y1="12" x2="19" y2="12" /> */}
      {/*             </svg> */}
      {/*           </button> */}
      {/*         </div> */}
      {/*       </div> */}
      {/**/}
      {/*       <div className="overflow-y-auto h-full  pb-[40px]"> */}
      {/*         {projectIdsWithoutInbox.map((id, i) => ( */}
      {/*           <ProjectItem */}
      {/*             key={id} */}
      {/*             projectId={id} */}
      {/*             orderNumber={i.toString()} */}
      {/*           /> */}
      {/*         ))} */}
      {/*       </div> */}
      {/*     </div> */}
      {/**/}
      {/*     <div className="px-3 py-3 border-t border-gray-800 flex-shrink-0"> */}
      {/*       <div className="flex flex-col gap-2"> */}
      {/*         <button */}
      {/*           onClick={handleDownloadBackup} */}
      {/*           className="w-full text-gray-400 flex items-center px-2 py-1.5 rounded-lg hover:bg-gray-800" */}
      {/*           title="Download backup of your tasks and projects" */}
      {/*         > */}
      {/*           <span className="text-sm">Download Backup</span> */}
      {/*         </button> */}
      {/*         <button */}
      {/*           onClick={handleLoadBackup} */}
      {/*           className="w-full text-gray-400 flex items-center px-2 py-1.5 rounded-lg hover:bg-gray-800" */}
      {/*           title="Load a previously downloaded backup" */}
      {/*         > */}
      {/*           <span className="text-sm">Load Backup</span> */}
      {/*         </button> */}
      {/*         <button */}
      {/*           className="w-full text-gray-400 flex items-center px-2 py-1.5 rounded-lg hover:bg-gray-800" */}
      {/*           title="Open settings" */}
      {/*         > */}
      {/*           <span className="text-sm">Settings</span> */}
      {/*         </button> */}
      {/*       </div> */}
      {/*     </div> */}
      {/*   </div> */}
      {/* </TabsContent> */}
      {/* </Tabs> */}
    </ColumnListProvider>
  );
};

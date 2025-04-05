import { observer } from "mobx-react-lite";
import { getRootStore } from "../../models/models";

export const Sidebar = observer(function SidebarComp() {
  const { allProjectsList, projectItemsListRegisry } = getRootStore();
  const projections = allProjectsList.withoutInbox;

  const selectedProject = "123";

  const inboxProjection = allProjectsList.inbox;
  const projectItemsList = projectItemsListRegisry.getListByProjectId(
    inboxProjection.itemRef.id,
  );
  console.log({ inboxProjection, projectItemsList });

  return (
    <div className="w-64 bg-gray-900 h-full flex flex-col overflow-hidden">
      {/* Default categories */}
      <div className="px-3 py-1">
        <div className="flex items-center px-2 py-2 rounded-lg hover:bg-gray-800 cursor-pointer">
          <span className="text-amber-500 mr-2 flex-shrink-0">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 12h-6l-2 3h-4l-2-3H2" />
              <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
            </svg>
          </span>
          <span className="text-white text-sm">Inbox</span>
          <span className="text-gray-400 ml-auto text-sm">
            {projectItemsList?.projections.length ?? 0}
          </span>
        </div>

        <div className="flex items-center px-2 py-2 rounded-lg hover:bg-gray-800 cursor-pointer">
          <span className="text-amber-500 mr-2 flex-shrink-0">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </span>
          <span className="text-white text-sm">Today</span>
        </div>
      </div>

      {/* Projects section */}
      <div className="mt-3 px-3">
        <div className="flex justify-between items-center mb-1 px-2">
          <span className="text-gray-400 text-xs">My projects</span>
          <div className="flex">
            <button className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center text-white">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Projects list - scrollable */}
        <div
          className="overflow-y-auto"
          style={{ maxHeight: "calc(100vh - 170px)" }}
        >
          {projections.map((proj) => (
            <div
              key={proj.id}
              className={`flex items-center px-2 py-1.5 rounded-lg cursor-pointer ${
                selectedProject === proj.id
                  ? "bg-gray-800"
                  : "hover:bg-gray-800"
              }`}
            >
              <span className="text-base mr-2 flex-shrink-0">
                {proj.itemRef.current.icon}
              </span>
              <span className="text-white text-sm whitespace-nowrap overflow-hidden text-ellipsis">
                {proj.itemRef.current.title}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* New project button */}
      <div className="mt-auto px-3 py-3 border-t border-gray-800">
        <button className="w-full text-gray-400 flex items-center px-2 py-1.5 rounded-lg hover:bg-gray-800">
          <span className="text-sm">Settings</span>
        </button>
      </div>
    </div>
  );
});

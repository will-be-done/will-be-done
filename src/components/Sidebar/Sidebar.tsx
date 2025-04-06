import { observer } from "mobx-react-lite";
import { getRootStore, Project } from "../../models/models";
import { Link } from "wouter";
import { getSnapshot } from "mobx-keystone";
import { getBackups, loadBackups, Backup } from "../../models/backup";

export const Sidebar = observer(function SidebarComp() {
  const { allProjectsList, projectsService } = getRootStore();
  const projects = allProjectsList.withoutInbox;
  const inboxProject = allProjectsList.inbox;

  const createProject = () => {
    const title = prompt("Project title");
    if (!title) return;

    projectsService.createProject(title, "", false, undefined);
  };

  const handleDownloadBackup = () => {
    const backup = getBackups(getRootStore());
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const now = new Date();
    const dateStr = now.toISOString().replace(/[:.]/g, "-").split(".")[0];
    a.download = `todo-backup-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleLoadBackup = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const result = event.target?.result;
          if (typeof result !== "string") {
            throw new Error("Failed to read file");
          }
          const parsedBackup = JSON.parse(result) as unknown;
          // Validate backup structure
          if (!isValidBackup(parsedBackup)) {
            throw new Error("Invalid backup format");
          }
          loadBackups(getRootStore(), parsedBackup);
        } catch (error) {
          console.error("Failed to load backup:", error);
          alert(
            "Failed to load backup file. Please make sure it's a valid backup file."
          );
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const isValidBackup = (data: unknown): data is Backup => {
    if (!data || typeof data !== "object") return false;
    const backup = data as Record<string, unknown>;
    return (
      Array.isArray(backup.tasks) &&
      Array.isArray(backup.projects) &&
      Array.isArray(backup.dailyLists) &&
      Array.isArray(backup.dailyListProjections)
    );
  };

  return (
    <div className="w-64 bg-gray-900 h-full flex flex-col">
      {/* Default categories */}
      <div className="px-3 py-1 flex-shrink-0">
        <Link
          href="/projects/inbox"
          className={(active) =>
            `flex items-center px-2 py-2 rounded-lg hover:bg-gray-800 cursor-pointer ${
              active ? "bg-gray-800" : "hover:bg-gray-800"
            }`
          }
        >
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
            {inboxProject?.children.length ?? 0}
          </span>
        </Link>

        <Link
          href="/today"
          className={(active) =>
            `flex items-center px-2 py-2 rounded-lg hover:bg-gray-800 cursor-pointer ${
              active ? "bg-gray-800" : "hover:bg-gray-800"
            }`
          }
        >
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
        </Link>
      </div>

      {/* Projects section */}
      <div className="mt-3 px-3 flex-1 min-h-0 overflow-hidden">
        <div className="flex justify-between items-center mb-1 px-2">
          <span className="text-gray-400 text-xs">My projects</span>
          <div className="flex">
            <button
              className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center text-white cursor-pointer"
              onClick={createProject}
              title="Create new project"
            >
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
        <div className="overflow-y-auto h-full  pb-[100px]">
          {projects.map((proj) => (
            <Link
              key={proj.id}
              className={(active) =>
                `flex items-center px-2 py-1.5 rounded-lg cursor-pointer ${
                  active ? "bg-gray-800" : "hover:bg-gray-800"
                }`
              }
              href={`/projects/${proj.id}`}
            >
              <span className="text-base mr-2 flex-shrink-0">{proj.icon}</span>
              <span className="text-white text-sm whitespace-nowrap overflow-hidden text-ellipsis">
                {proj.title}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* Backup and Settings section */}
      <div className="px-3 py-3 border-t border-gray-800 flex-shrink-0">
        <div className="flex flex-col gap-2">
          <button
            onClick={handleDownloadBackup}
            className="w-full text-gray-400 flex items-center px-2 py-1.5 rounded-lg hover:bg-gray-800"
            title="Download backup of your tasks and projects"
          >
            <span className="text-sm">Download Backup</span>
          </button>
          <button
            onClick={handleLoadBackup}
            className="w-full text-gray-400 flex items-center px-2 py-1.5 rounded-lg hover:bg-gray-800"
            title="Load a previously downloaded backup"
          >
            <span className="text-sm">Load Backup</span>
          </button>
          <button
            className="w-full text-gray-400 flex items-center px-2 py-1.5 rounded-lg hover:bg-gray-800"
            title="Open settings"
          >
            <span className="text-sm">Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
});

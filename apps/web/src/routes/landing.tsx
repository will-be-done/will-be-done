import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/landing")({
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Hero Section */}
      <div className="border-b-2 border-dashed border-slate-300">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="mb-6 inline-flex items-center gap-2 border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-2">
            <span className="text-sm font-medium tracking-tight">
              • Self Hostable • Privacy First • Open Source
            </span>
          </div>
          <h1 className="mb-6 text-5xl font-bold tracking-tight md:text-6xl lg:text-7xl">
            Will Be Done
          </h1>
          <p className="mb-10 max-w-2xl text-xl text-slate-600 md:text-2xl">
            Self-hosted task manager for visual weekly planning with drag & drop
            everything and vim keybindings. Own your data, plan your week.
          </p>
        </div>
      </div>

      {/* Get Started Your Way Section */}
      <div className="border-y-2 border-dashed border-slate-300 bg-slate-50">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="mb-12">
            <h2 className="mb-4 text-4xl font-bold md:text-5xl">
              Get Started Your Way
            </h2>
            <p className="text-xl text-slate-600">
              Choose between self-hosting or our cloud version
            </p>
          </div>

          <div className="grid gap-8 lg:grid-cols-2">
            {/* Self-Hosted Option */}
            <div className="flex flex-col">
              <div className="mb-4 flex items-center gap-2">
                <h3 className="text-2xl font-bold text-slate-900">
                  Self-Hosted
                </h3>
              </div>
              <p className="mb-6 text-slate-600">
                One Docker command. Complete control of your data.
              </p>

              <div className="group relative flex-1 border-2 border-dashed border-slate-300 bg-white p-8 transition-all hover:border-slate-400">
                {/* Decorative corners */}
                <div className="absolute left-0 top-0 h-3 w-3 border-l-2 border-t-2 border-emerald-500"></div>
                <div className="absolute right-0 top-0 h-3 w-3 border-r-2 border-t-2 border-emerald-500"></div>
                <div className="absolute bottom-0 left-0 h-3 w-3 border-b-2 border-l-2 border-emerald-500"></div>
                <div className="absolute bottom-0 right-0 h-3 w-3 border-b-2 border-r-2 border-emerald-500"></div>

                <pre className="overflow-x-auto text-sm leading-relaxed text-slate-800">
                  <code>
                    {`docker run -d \\
  -p 3000:3000 \\
  -v will_be_done_storage:/app/apps/api/dbs \\
  --restart unless-stopped \\
  ghcr.io/will-be-done/will-be-done:latest`}
                  </code>
                </pre>
              </div>

              <div className="mt-4 flex items-start gap-3 border-2 border-dashed border-slate-300 bg-white p-4">
                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <svg
                    className="h-4 w-4"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="text-sm">
                  <p className="font-medium text-slate-900">
                    Access at{"  "}
                    <code className="rounded border border-dashed border-slate-300 bg-slate-50 px-2 py-0.5 font-mono text-slate-900">
                      localhost:3000
                    </code>
                  </p>
                </div>
              </div>
            </div>

            {/* Cloud Option */}
            <div className="flex flex-col">
              <div className="mb-4 flex items-center gap-2">
                <h3 className="text-2xl font-bold text-slate-900">
                  Cloud Version
                </h3>
                <span className="rounded border border-dashed border-blue-400 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                  FREE IN ALPHA
                </span>
              </div>
              <p className="mb-6 text-slate-600">
                Don't want to self-host? Try our hosted version.
              </p>

              <div className="group relative flex flex-1 flex-col justify-between border-2 border-dashed border-slate-300 bg-white p-8 transition-all hover:border-slate-400">
                {/* Decorative corners */}
                <div className="absolute left-0 top-0 h-3 w-3 border-l-2 border-t-2 border-blue-500"></div>
                <div className="absolute right-0 top-0 h-3 w-3 border-r-2 border-t-2 border-blue-500"></div>
                <div className="absolute bottom-0 left-0 h-3 w-3 border-b-2 border-l-2 border-blue-500"></div>
                <div className="absolute bottom-0 right-0 h-3 w-3 border-b-2 border-r-2 border-blue-500"></div>

                <div>
                  <ul className="space-y-3 text-slate-700">
                    <li className="flex items-start gap-3">
                      <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500"></div>
                      <span>No setup required</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500"></div>
                      <span>Access from anywhere</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500"></div>
                      <span>Automatic updates</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500"></div>
                      <span>Free while in alpha</span>
                    </li>
                  </ul>
                </div>

                <Link
                  to="/signup"
                  className="mt-8 inline-flex w-full items-center justify-center gap-2 border-2 border-dashed border-slate-800 bg-slate-900 px-6 py-3 font-semibold text-white transition-all hover:scale-105 hover:bg-slate-800"
                >
                  <span>Try Cloud Version</span>
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 7l5 5m0 0l-5 5m5-5H6"
                    />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-12">
          <h2 className="mb-4 text-4xl font-bold md:text-5xl">Top Features</h2>
          <p className="text-xl text-slate-600">
            Everything you need for effective daily planning
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            number="1"
            title="Weekly Timeline View"
            description="See multiple days as columns, plan your week visually"
          />
          <FeatureCard
            number="2"
            title="Everything Drag & Drop"
            description="Move tasks between days, projects, categories effortlessly"
          />
          <FeatureCard
            number="3"
            title="Kanban Boards Everywhere"
            description="Each project has categories (Week/Month/Ideas/etc)"
          />
          <FeatureCard
            number="4"
            title="Multiple Spaces"
            description="Separate workspaces for work/personal/different projects"
          />
          <FeatureCard
            number="5"
            title="Local First"
            description="Works offline, syncs back when you're online"
          />
          <FeatureCard
            number="6"
            title="Self-Hosted"
            description="One docker command, no external dependencies"
          />
        </div>
      </div>

      {/* Coming Soon Section */}
      <div className="mx-auto max-w-6xl px-6 py-20 pt-0">
        <div className="mb-12">
          <h2 className="mb-4 text-4xl font-bold md:text-5xl">Coming Soon</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <ComingSoonItem text="Attachments and comments for tasks" />
          <ComingSoonItem text="Global search" />
          <ComingSoonItem text="More vim keybindings (beyond basic j/k navigation)" />
          <ComingSoonItem text="Calendar integration" />
          <ComingSoonItem text="Mobile-friendly UI" />
        </div>
      </div>

      {/* Footer */}
      <div className="border-t-2 border-dashed border-slate-300 bg-slate-50">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="flex flex-col items-center justify-between gap-4 text-sm text-slate-600 md:flex-row">
            <div className="flex items-center gap-2">
              <span>• Self-hosted • Open Source • Built with React & Bun</span>
            </div>
            <div className="flex gap-6">
              <a
                href="https://github.com/quolpr/will-be-done-app"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-slate-900"
              >
                GitHub
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="group relative border-2 border-dashed border-slate-300 bg-white p-6 transition-all hover:border-slate-400 hover:bg-slate-50">
      {/* Decorative corners - only visible on hover */}
      <div className="absolute left-0 top-0 h-3 w-3 border-l-2 border-t-2 border-emerald-500 opacity-0 transition-opacity group-hover:opacity-100"></div>
      <div className="absolute right-0 top-0 h-3 w-3 border-r-2 border-t-2 border-emerald-500 opacity-0 transition-opacity group-hover:opacity-100"></div>
      <div className="absolute bottom-0 left-0 h-3 w-3 border-b-2 border-l-2 border-emerald-500 opacity-0 transition-opacity group-hover:opacity-100"></div>
      <div className="absolute bottom-0 right-0 h-3 w-3 border-b-2 border-r-2 border-emerald-500 opacity-0 transition-opacity group-hover:opacity-100"></div>

      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center border-2 border-dashed border-slate-800 bg-slate-900 font-mono text-sm font-bold text-white">
          {number}
        </div>
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
      </div>
      <p className="text-slate-600">{description}</p>
    </div>
  );
}

function ComingSoonItem({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3 border-2 border-dashed border-slate-300 bg-white p-4 transition-all hover:border-slate-400 hover:bg-slate-50">
      <span className="text-slate-700">{text}</span>
    </div>
  );
}

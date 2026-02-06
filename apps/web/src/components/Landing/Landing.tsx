import { Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";

const logoPath =
  "M40.4835 111.929C39.5895 111.929 38.7321 111.575 38.0999 110.945C37.4678 110.316 37.1126 109.462 37.1126 108.571V41.4286C37.1126 40.5382 37.4678 39.6843 38.0999 39.0547C38.7321 38.4251 39.5895 38.0714 40.4835 38.0714H102.845C104.186 38.0714 105.472 37.5409 106.42 36.5965C107.368 35.6521 107.901 34.3713 107.901 33.0357C107.901 31.7002 107.368 30.4193 106.42 29.4749C105.472 28.5305 104.186 28 102.845 28H40.4835C36.9074 28 33.4779 29.4148 30.9492 31.9331C28.4206 34.4515 27 37.8671 27 41.4286V108.571C27 112.133 28.4206 115.549 30.9492 118.067C33.4779 120.585 36.9074 122 40.4835 122H107.901C111.477 122 114.907 120.585 117.435 118.067C119.964 115.549 121.384 112.133 121.384 108.571V86.75C121.384 85.4144 120.852 84.1336 119.903 83.1892C118.955 82.2448 117.669 81.7143 116.328 81.7143C114.987 81.7143 113.701 82.2448 112.753 83.1892C111.804 84.1336 111.272 85.4144 111.272 86.75V108.571C111.272 109.462 110.917 110.316 110.284 110.945C109.652 111.575 108.795 111.929 107.901 111.929H40.4835ZM126.643 52.7086C127.536 51.754 128.022 50.4914 127.999 49.1868C127.976 47.8822 127.445 46.6375 126.519 45.7148C125.593 44.7922 124.343 44.2637 123.033 44.2407C121.723 44.2177 120.455 44.7019 119.497 45.5914L82.0261 82.9027L69.3988 69.9039C68.9381 69.4244 68.3868 69.0404 67.7766 68.7739C67.1664 68.5074 66.5093 68.3636 65.843 68.3508C65.1768 68.3381 64.5147 68.4566 63.8946 68.6995C63.2746 68.9425 62.7088 69.3051 62.23 69.7666C61.7511 70.228 61.3685 70.7791 61.1042 71.3883C60.84 71.9975 60.6992 72.6527 60.69 73.3163C60.6808 73.9798 60.8034 74.6386 61.0508 75.2548C61.2981 75.871 61.6653 76.4325 62.1312 76.9069L78.3316 93.5851C78.7978 94.0666 79.3555 94.4508 79.9724 94.7152C80.5892 94.9797 81.2528 95.1191 81.9243 95.1254C82.5959 95.1316 83.2619 95.0046 83.8836 94.7517C84.5053 94.4987 85.0702 94.125 85.5453 93.6523L126.643 52.7086Z";

// Logo with matching colors + glow
function Logo({ size = 32 }: { size?: number }) {
  const id = `logo_${size}`;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-[13%] bg-blue-500/30 blur-md"
        style={{ transform: "scale(1.15)" }}
      />
      <svg
        width={size}
        height={size}
        viewBox="0 0 150 150"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative"
      >
        <rect width="150" height="150" rx="19" fill={`url(#paint0_${id})`} />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d={logoPath}
          fill={`url(#paint1_${id})`}
        />
        <defs>
          <linearGradient
            id={`paint0_${id}`}
            x1="9"
            y1="5.5"
            x2="150"
            y2="150"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#3b82f6" />
            <stop offset="1" stopColor="#1e40af" />
          </linearGradient>
          <linearGradient
            id={`paint1_${id}`}
            x1="27"
            y1="28"
            x2="118.5"
            y2="120.5"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#93c5fd" />
            <stop offset="1" stopColor="#60a5fa" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

export function LandingPage() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Normalize to -1 to 1 range based on viewport
      const x = (e.clientX / window.innerWidth - 0.5) * 2;
      const y = (e.clientY / window.innerHeight - 0.5) * 2;
      setMousePosition({ x, y });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <div className="relative min-h-screen bg-[#0a0a0f] text-slate-100 antialiased">
      {/* Subtle gradient orbs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-[400px] left-1/2 h-[800px] w-[800px] -translate-x-1/2 rounded-full bg-blue-600/8 blur-[120px]" />
        <div className="absolute -bottom-[200px] -right-[200px] h-[600px] w-[600px] rounded-full bg-indigo-500/6 blur-[100px]" />
      </div>

      {/* Noise texture overlay */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.015]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      <nav className="sr-only" aria-label="Main navigation">
        <a href="/">Home</a>
        <Link to="/signup">Sign Up</Link>
        <Link to="/login">Sign In</Link>
        <a href="https://github.com/will-be-done/will-be-done">GitHub</a>
      </nav>

      <main>
        {/* Hero */}
        <section
          aria-label="Hero"
          className="relative px-6 pb-16 pt-20 md:pb-20 md:pt-10"
        >
          <div className="mx-auto max-w-5xl">
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <div>
                <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-blue-500/10 px-3 py-1.5 ring-1 ring-blue-500/20">
                  <span className="text-[12px] font-medium tracking-wide text-blue-300">
                    Open Source
                  </span>
                  <span className="text-blue-400/50">·</span>
                  <span className="text-[12px] font-medium tracking-wide text-blue-300">
                    Self Hosted
                  </span>
                  <span className="text-blue-400/50">·</span>
                  <span className="text-[12px] font-medium tracking-wide text-blue-300">
                    Offline First
                  </span>
                </div>

                <h1 className="mb-5 text-4xl font-bold leading-[1.1] tracking-tight text-white md:text-5xl lg:text-[56px]">
                  Weekly planning
                  <br />
                  <span className="text-slate-500">that actually works</span>
                </h1>

                <p className="mb-8 max-w-lg text-[17px] leading-relaxed text-slate-400">
                  Open source self-hosted kanban for visual weekly planning.
                  Drag & drop tasks between days and projects, navigate with vim
                  keybindings. Works offline, syncs when you're back online.
                </p>

                <div className="flex flex-wrap items-start gap-3">
                  <div className="flex flex-col items-start gap-1.5">
                    <Link
                      to="/signup"
                      className="group inline-flex items-center gap-2 rounded-xl bg-blue-500 px-5 py-3 text-[14px] font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-blue-400 hover:shadow-blue-500/30"
                    >
                      Try Cloud Version
                      <svg
                        className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M13 7l5 5m0 0l-5 5m5-5H6"
                        />
                      </svg>
                    </Link>
                    <span className="text-[12px] text-slate-500">
                      Free while in alpha
                    </span>
                  </div>
                  <a
                    href="https://github.com/will-be-done/will-be-done"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl bg-white/[0.05] px-5 py-3 text-[14px] font-medium text-slate-300 ring-1 ring-white/[0.08] transition-all hover:bg-white/[0.08] hover:text-white"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        fillRule="evenodd"
                        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                        clipRule="evenodd"
                      />
                    </svg>
                    View on GitHub
                  </a>
                </div>
              </div>

              {/* Floating task cards */}
              <div className="relative hidden h-[340px] lg:block">
                {/* Card 1 - Top, normal state */}
                <FloatingTaskCard
                  title="Design new landing page"
                  category="Personal"
                  categoryIcon="🎨"
                  horizon="Week"
                  className="absolute left-8 top-0 w-64"
                  style={{
                    transform: `rotate(-2deg) translate(${mousePosition.x * 4}px, ${mousePosition.y * 3}px)`,
                  }}
                />

                {/* Card 2 - Middle, done state */}
                <FloatingTaskCard
                  title="Review pull requests"
                  category="Work"
                  categoryIcon="💼"
                  horizon="Week"
                  isDone
                  className="absolute right-0 top-24 w-72"
                  style={{
                    transform: `rotate(1deg) translate(${mousePosition.x * -5}px, ${mousePosition.y * 4}px)`,
                  }}
                />

                {/* Card 3 - Bottom left, normal state */}
                <FloatingTaskCard
                  title="Write documentation"
                  category="Work"
                  categoryIcon="💼"
                  horizon="Near future"
                  className="absolute bottom-18 left-4 w-60"
                  style={{
                    transform: `rotate(2deg) translate(${mousePosition.x * 3}px, ${mousePosition.y * -4}px)`,
                  }}
                />

                {/* Card 4 - Bottom right, focused state */}
                <FloatingTaskCard
                  title="Ship v2.0 release"
                  category="Release"
                  categoryIcon="🚀"
                  horizon="Week"
                  isFocused
                  className="absolute bottom-6 right-8 w-56"
                  style={{
                    transform: `rotate(-1deg) translate(${mousePosition.x * -4}px, ${mousePosition.y * -3}px)`,
                  }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Self-host section */}
        <section
          aria-label="Self-hosting"
          className="relative border-t border-white/[0.04] px-6 py-20"
        >
          <div className="mx-auto max-w-5xl">
            <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
              <div>
                <div className="mb-4 inline-flex items-center gap-2 rounded-lg bg-slate-800/50 px-3 py-1.5">
                  <svg
                    className="h-4 w-4 text-slate-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2"
                    />
                  </svg>
                  <span className="text-[12px] font-medium text-slate-400">
                    Self-hosted
                  </span>
                </div>

                <h2 className="mb-4 text-2xl font-bold tracking-tight text-white md:text-3xl">
                  One command to own your data
                </h2>

                <p className="mb-6 text-[15px] leading-relaxed text-slate-400">
                  Run it on your own server. No external dependencies, no
                  accounts, no tracking. Just a simple Docker container.
                </p>

                <ul className="space-y-3 text-[14px] text-slate-400">
                  <li className="flex items-center gap-3">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/10">
                      <svg
                        className="h-3 w-3 text-blue-400"
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
                    SQLite database, easily backed up
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/10">
                      <svg
                        className="h-3 w-3 text-blue-400"
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
                    Works offline, syncs when connected
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/10">
                      <svg
                        className="h-3 w-3 text-blue-400"
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
                    Multi-space support for work & personal
                  </li>
                </ul>
              </div>

              <div className="overflow-hidden rounded-xl bg-[#0d0d14] ring-1 ring-white/[0.08]">
                <div className="flex items-center gap-2 bg-[#1a1a1f] px-3 py-2.5">
                  <div className="flex gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                  </div>
                  <span className="ml-2 text-[11px] text-slate-500">
                    terminal
                  </span>
                </div>
                <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed">
                  <code>
                    <span className="text-slate-500">$</span>{" "}
                    <span className="text-slate-200">docker run -d \</span>
                    {"\n"}
                    {"  "}
                    <span className="text-slate-400">-p 3000:3000 \</span>
                    {"\n"}
                    {"  "}
                    <span className="text-slate-400">
                      -v will_be_done:/app/apps/api/dbs \
                    </span>
                    {"\n"}
                    {"  "}
                    <span className="text-slate-400">
                      --restart unless-stopped \
                    </span>
                    {"\n"}
                    {"  "}
                    <span className="text-blue-400">
                      ghcr.io/will-be-done/will-be-done:latest
                    </span>
                    {"\n\n"}
                    <span className="text-green-400">✓</span>{" "}
                    <span className="text-slate-400">Running at</span>{" "}
                    <span className="text-blue-300">http://localhost:3000</span>
                  </code>
                </pre>
              </div>
            </div>
          </div>
        </section>

        {/* App Screenshot */}
        <section
          aria-label="App screenshot"
          className="relative px-6 py-24 border-t border-white/[0.04] "
        >
          <div className="mx-auto max-w-5xl">
            <div className="overflow-hidden rounded-lg ring-1 ring-white/10 shadow-2xl shadow-black/50">
              {/* <div className="flex h-10 items-center gap-4 bg-[#38383d] px-3"> */}
              {/*   <div className="flex gap-2"> */}
              {/*     <div className="h-3 w-3 rounded-full bg-[#ff5f56]" /> */}
              {/*     <div className="h-3 w-3 rounded-full bg-[#ffbd2e]" /> */}
              {/*     <div className="h-3 w-3 rounded-full bg-[#27c93f]" /> */}
              {/*   </div> */}
              {/*   <div className="flex flex-1 justify-center"> */}
              {/*     <div className="rounded-md bg-[#1d1d1f] px-4 py-1"> */}
              {/*       <span className="text-xs text-white/60">localhost:3000</span> */}
              {/*     </div> */}
              {/*   </div> */}
              {/*   <div className="w-[60px]" /> */}
              {/* </div> */}

              {/* Screenshot */}
              <img
                src="/screen.png"
                alt="Will Be Done - Weekly timeline view with tasks organized by day"
                className="w-full"
              />
            </div>
          </div>
        </section>

        {/* Features */}
        <section
          aria-label="Features"
          className="relative border-t border-white/[0.04] px-6 py-20"
        >
          <div className="mx-auto max-w-5xl">
            <h2 className="mb-12 text-2xl font-bold tracking-tight text-white md:text-3xl">
              Features
            </h2>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <FeatureCard
                icon={
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                }
                title="Weekly timeline"
                description="See your entire week as columns. Drag tasks between days."
              />
              <FeatureCard
                icon={
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                    />
                  </svg>
                }
                title="Drag & drop"
                description="Move tasks between days, projects, and categories."
              />
              <FeatureCard
                icon={
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
                    />
                  </svg>
                }
                title="Kanban per project"
                description="Week, Month, Ideas, Someday — organize your way."
              />
              <FeatureCard
                icon={
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                    />
                  </svg>
                }
                title="Multiple spaces"
                description="Separate workspaces for work, personal, and side projects."
              />
              <FeatureCard
                icon={
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
                    />
                  </svg>
                }
                title="Offline first"
                description="Works offline. Syncs back when you're online."
              />
              <FeatureCard
                icon={
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                }
                title="Vim keybindings"
                description="Navigate with j/k, quick actions with shortcuts."
              />
              <FeatureCard
                icon={
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
                    />
                  </svg>
                }
                title="One Docker container"
                description="Self-host with a single command. No complex setup."
              />
              <FeatureCard
                icon={
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                }
                title="Instant sync"
                description="Changes sync across all browser tabs in real-time."
              />
              <FeatureCard
                icon={
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                }
                title="Top tier performance"
                description="Built on hyperdb, a custom high-performance database engine."
              />
            </div>
          </div>
        </section>

        {/* Roadmap */}
        <section
          aria-label="Roadmap"
          className="relative border-t border-white/[0.04] px-6 py-20"
        >
          <div className="mx-auto max-w-5xl">
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/10">
                <div className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              </div>
              <h2 className="text-lg font-semibold text-white">Coming soon</h2>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <RoadmapItem text="Task comments and attachments" />
              <RoadmapItem text="Global search" />
              <RoadmapItem text="More vim keybindings" />
              <RoadmapItem text="Mobile-friendly UI" />
            </div>
          </div>
        </section>

        {/* CTA */}
        <section
          aria-label="Call to action"
          className="relative border-t border-white/[0.04] px-6 py-20"
        >
          <div className="mx-auto max-w-5xl">
            <div className="rounded-2xl bg-gradient-to-br from-blue-500/10 via-transparent to-indigo-500/10 p-8 ring-1 ring-white/[0.06] md:p-12">
              <div className="mx-auto max-w-xl text-center">
                <h2 className="mb-4 text-2xl font-bold tracking-tight text-white md:text-3xl">
                  Ready to plan your week?
                </h2>
                <p className="mb-8 text-[15px] text-slate-400">
                  Free cloud version while in alpha. Self-host anytime.
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  <Link
                    to="/signup"
                    className="group inline-flex items-center gap-2 rounded-xl bg-blue-500 px-6 py-3 text-[14px] font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-blue-400"
                  >
                    Get Started — It's Free
                    <svg
                      className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M13 7l5 5m0 0l-5 5m5-5H6"
                      />
                    </svg>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative border-t border-white/[0.04] px-6 py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 md:flex-row">
          <div className="flex items-center gap-2.5">
            <Logo size={24} />
            <span className="text-[13px] font-medium text-slate-400">
              Will Be Done
            </span>
          </div>

          <div className="flex items-center gap-4 text-[12px] text-slate-500">
            <span>Open Source</span>
            <span className="text-slate-700">·</span>
            <span>AGPL license</span>
            <span className="text-slate-700">·</span>
            <a
              href="https://github.com/will-be-done/will-be-done"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-slate-400 transition-colors hover:text-white"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path
                  fillRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  clipRule="evenodd"
                />
              </svg>
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl bg-white/[0.02] p-5 ring-1 ring-white/[0.04] transition-colors hover:bg-white/[0.03] hover:ring-white/[0.06]">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
        {icon}
      </div>
      <h3 className="mb-1.5 text-[14px] font-medium text-white">{title}</h3>
      <p className="text-[13px] leading-relaxed text-slate-400">
        {description}
      </p>
    </div>
  );
}

function RoadmapItem({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-white/[0.02] px-4 py-3 ring-1 ring-white/[0.04]">
      <svg
        className="h-4 w-4 flex-shrink-0 text-slate-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <span className="text-[13px] text-slate-300">{text}</span>
    </div>
  );
}

// Floating task card for landing page hero
function FloatingTaskCard({
  title,
  category,
  categoryIcon,
  horizon,
  isDone = false,
  isFocused = false,
  className,
  style,
}: {
  title: string;
  category: string;
  categoryIcon: string;
  horizon: string;
  isDone?: boolean;
  isFocused?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (isDone) {
    return (
      <div
        className={`rounded-lg backdrop-blur-md ring-1 ring-done-ring shadow-lg transition-transform duration-300 ease-out ${className}`}
        style={style}
      >
        <div className="flex items-start gap-1.5 px-2 pt-2 text-base font-medium bg-done-panel/80 pb-3 rounded-t-lg">
          <div className="mt-0.5 flex size-4 flex-shrink-0 items-center justify-center rounded-sm bg-input-checked ring-1 ring-input-checked">
            <svg
              className="size-2.5 text-white"
              fill="currentColor"
              viewBox="0 0 10 10"
            >
              <path d="M9.1603 1.12218C9.50684 1.34873 9.60427 1.81354 9.37792 2.16038L5.13603 8.66012C5.01614 8.8438 4.82192 8.96576 4.60451 8.99384C4.3871 9.02194 4.1683 8.95335 4.00574 8.80615L1.24664 6.30769C0.939709 6.02975 0.916013 5.55541 1.19372 5.24822C1.47142 4.94102 1.94536 4.91731 2.2523 5.19524L4.36085 7.10461L8.12299 1.33999C8.34934 0.993152 8.81376 0.895638 9.1603 1.12218Z" />
            </svg>
          </div>
          <div className="min-h-5 text-done-content line-through">{title}</div>
        </div>
        <div className="flex justify-between rounded-b-lg bg-done-panel-tinted/80 px-2 py-1.5 text-xs text-done-content">
          <span>{horizon}</span>
          <span>
            {categoryIcon} {category}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg backdrop-blur-md shadow-lg transition-transform duration-300 ease-out ${
        isFocused ? "ring-2 ring-accent" : "ring-1 ring-ring"
      } ${className}`}
      style={style}
    >
      <div
        className={`flex items-start gap-1.5 px-2 pt-2 text-base font-medium pb-3 rounded-t-lg ${
          isFocused ? "bg-panel-hover/80" : "bg-panel/80"
        }`}
      >
        <div className="mt-0.5 flex size-4 flex-shrink-0 items-center justify-center rounded-sm bg-input-bg ring-1 ring-ring" />
        <div className="min-h-5 text-content">{title}</div>
      </div>
      <div className="flex justify-between rounded-b-lg bg-panel-tinted/80 px-2 py-1.5 text-xs text-content-tinted">
        <span>{horizon}</span>
        <span>
          {categoryIcon} {category}
        </span>
      </div>
    </div>
  );
}

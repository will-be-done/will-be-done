import { spawn, type ChildProcess } from "child_process";
import net from "net";
import blessed from "blessed";

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

function createTUI(apiPort: number) {
  const screen = blessed.screen({
    smartCSR: true,
    title: `dev-all (API port: ${apiPort})`,
  });

  let activeTab = 0;
  const tabs = [
    { name: "API Server", color: "green" },
    { name: "Web Client", color: "cyan" },
  ];

  const tabBar = blessed.box({
    top: 0,
    left: 0,
    width: "100%",
    height: 1,
    tags: true,
  });

  const logs: blessed.Widgets.Log[] = tabs.map((_, i) =>
    blessed.log({
      top: 1,
      left: 0,
      width: "100%",
      height: "100%-2",
      scrollable: true,
      alwaysScroll: true,
      scrollbar: { ch: "█", style: { fg: "white" } },
      mouse: true,
      keys: true,
      vi: true,
      hidden: i !== 0,
      tags: true,
    }),
  );

  const statusBar = blessed.box({
    bottom: 0,
    left: 0,
    width: "100%",
    height: 1,
    tags: true,
    content: `{gray-fg} 1/2: switch tabs | ↑↓/j/k: scroll | q: quit | API port: ${apiPort}{/gray-fg}`,
  });

  screen.append(tabBar);
  logs.forEach((log) => screen.append(log));
  screen.append(statusBar);

  function renderTabs() {
    const parts = tabs.map((tab, i) => {
      if (i === activeTab) {
        return `{bold}{white-bg}{black-fg} ${tab.name} {/black-fg}{/white-bg}{/bold}`;
      }
      return `{gray-fg} ${tab.name} {/gray-fg}`;
    });
    tabBar.setContent(parts.join("  "));
    screen.render();
  }

  function switchTab(index: number) {
    logs[activeTab].hide();
    activeTab = index;
    logs[activeTab].show();
    logs[activeTab].focus();
    renderTabs();
  }

  screen.key(["1"], () => switchTab(0));
  screen.key(["2"], () => switchTab(1));
  screen.key(["tab"], () => switchTab((activeTab + 1) % tabs.length));
  screen.key(["q", "C-c"], () => {
    cleanup();
    screen.destroy();
    process.exit(0);
  });

  renderTabs();
  logs[0].focus();

  let cleanup = () => {};

  return {
    appendLog(tabIndex: number, text: string) {
      const lines = text.split("\n");
      for (const line of lines) {
        if (line.length > 0) {
          logs[tabIndex].log(line);
        }
      }
    },
    setCleanup(fn: () => void) {
      cleanup = fn;
    },
    screen,
  };
}

async function main() {
  const apiPort = await findFreePort();
  const tui = createTUI(apiPort);

  tui.appendLog(0, `Starting API server on port ${apiPort}...`);
  tui.appendLog(1, `Starting Web client (proxying to API port ${apiPort})...`);

  const apiProc = spawn("bun", ["run", "--cwd", "apps/api", "dev"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(apiPort), FORCE_COLOR: "1" },
  });

  const webProc = spawn("bun", ["run", "--cwd", "apps/web", "dev"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, VITE_API_PORT: String(apiPort), FORCE_COLOR: "1" },
  });

  const pipe = (proc: ChildProcess, tabIndex: number) => {
    proc.stdout?.on("data", (data: Buffer) => {
      tui.appendLog(tabIndex, data.toString());
    });
    proc.stderr?.on("data", (data: Buffer) => {
      tui.appendLog(tabIndex, data.toString());
    });
  };

  pipe(apiProc, 0);
  pipe(webProc, 1);

  const cleanup = () => {
    apiProc.kill();
    webProc.kill();
  };

  tui.setCleanup(cleanup);

  process.on("SIGINT", () => {
    cleanup();
    tui.screen.destroy();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanup();
    tui.screen.destroy();
    process.exit(0);
  });

  apiProc.on("exit", (code) => {
    tui.appendLog(0, `API server exited with code ${code}`);
    webProc.kill();
    setTimeout(() => {
      tui.screen.destroy();
      process.exit(code ?? 1);
    }, 1000);
  });

  webProc.on("exit", (code) => {
    tui.appendLog(1, `Web client exited with code ${code}`);
    apiProc.kill();
    setTimeout(() => {
      tui.screen.destroy();
      process.exit(code ?? 1);
    }, 1000);
  });
}

main();

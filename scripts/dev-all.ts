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

async function findDistinctFreePort(otherPort: number): Promise<number> {
  let port = await findFreePort();
  while (port === otherPort) port = await findFreePort();
  return port;
}

function waitForPort(port: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    const tryConnect = () => {
      const socket = net.createConnection({ host: "127.0.0.1", port });
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() >= deadline) {
          reject(new Error(`Timed out waiting for tursod on port ${port}`));
          return;
        }
        setTimeout(tryConnect, 250);
      });
    };

    tryConnect();
  });
}

function createTUI(apiPort: number, tursodPort?: number) {
  const screen = blessed.screen({
    smartCSR: true,
    title: `dev-all (API port: ${apiPort})`,
  });

  let activeTab = 0;
  const tabs = [
    { name: "API Server", color: "green" },
    { name: "Web Client", color: "cyan" },
    ...(tursodPort === undefined ? [] : [{ name: "tursod", color: "yellow" }]),
  ];

  const tabBar = blessed.box({
    top: 0,
    left: 0,
    width: "100%",
    height: 1,
    tags: true,
  });

  const logs: blessed.Widgets.Log[] = tabs.map((_, index) =>
    blessed.log({
      top: 1,
      left: 0,
      width: "100%",
      height: "100%-2",
      scrollable: true,
      alwaysScroll: true,
      scrollbar: { ch: "█", style: { fg: "white" } },
      keys: true,
      vi: true,
      hidden: index !== 0,
      tags: true,
    }),
  );

  const servicePorts =
    tursodPort === undefined
      ? `API port: ${apiPort}`
      : `API port: ${apiPort} | tursod port: ${tursodPort}`;
  const statusBar = blessed.box({
    bottom: 0,
    left: 0,
    width: "100%",
    height: 1,
    tags: true,
    content: `{gray-fg} ${tabs.map((_, index) => index + 1).join("/")}: switch tabs | ↑↓/j/k: scroll | drag: select | q: quit | ${servicePorts}{/gray-fg}`,
  });

  screen.append(tabBar);
  logs.forEach((log) => screen.append(log));
  screen.append(statusBar);

  function renderTabs() {
    const parts = tabs.map((tab, index) => {
      if (index === activeTab) {
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

  tabs.forEach((_, index) => {
    screen.key([String(index + 1)], () => switchTab(index));
  });
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
        if (line.length > 0) logs[tabIndex].log(line);
      }
    },
    setCleanup(fn: () => void) {
      cleanup = fn;
    },
    screen,
  };
}

async function main() {
  const usesTursod = process.env.WBD_DB_ENGINE === "tursod";
  const apiPort = await findFreePort();
  const tursodPort = usesTursod
    ? await findDistinctFreePort(apiPort)
    : undefined;
  const tui = createTUI(apiPort, tursodPort);
  const processes = new Set<ChildProcess>();
  let shuttingDown = false;

  const cleanup = () => {
    shuttingDown = true;
    for (const process of processes) process.kill();
  };
  tui.setCleanup(cleanup);

  const pipe = (process: ChildProcess, tabIndex: number) => {
    process.stdout?.on("data", (data: Buffer) => {
      tui.appendLog(tabIndex, data.toString());
    });
    process.stderr?.on("data", (data: Buffer) => {
      tui.appendLog(tabIndex, data.toString());
    });
  };

  const watch = (process: ChildProcess, name: string, tabIndex: number) => {
    processes.add(process);
    pipe(process, tabIndex);
    process.on("exit", (code) => {
      processes.delete(process);
      if (shuttingDown) return;
      tui.appendLog(tabIndex, `${name} exited with code ${code}`);
      cleanup();
      setTimeout(() => {
        tui.screen.destroy();
        globalThis.process.exit(code ?? 1);
      }, 1_000);
    });
  };

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

  if (tursodPort !== undefined) {
    tui.appendLog(2, `Starting tursod on port ${tursodPort}...`);
    const tursodProcess = spawn("cargo", ["run"], {
      cwd: "apps/tursod",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PORT: String(tursodPort),
        FORCE_COLOR: "1",
      },
    });
    watch(tursodProcess, "tursod", 2);
    try {
      await waitForPort(tursodPort, 120_000);
      tui.appendLog(2, "tursod is ready");
    } catch (error) {
      tui.appendLog(2, String(error));
      cleanup();
      tui.screen.destroy();
      process.exit(1);
    }
  }

  tui.appendLog(0, `Starting API server on port ${apiPort}...`);
  const apiProcess = spawn("pnpm", ["-C", "apps/api", "dev"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PORT: String(apiPort),
      FORCE_COLOR: "1",
      ...(tursodPort === undefined
        ? {}
        : { WBD_TURSOD_URL: `http://127.0.0.1:${tursodPort}` }),
    },
  });
  watch(apiProcess, "API server", 0);

  tui.appendLog(1, `Starting Web client (proxying to API port ${apiPort})...`);
  const webProcess = spawn("pnpm", ["-C", "apps/web", "dev"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      VITE_API_PORT: String(apiPort),
      FORCE_COLOR: "1",
    },
  });
  watch(webProcess, "Web client", 1);
}

void main();

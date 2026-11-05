import fs from "fs";
import path from "path";
import { afterEach, expect, it, vi } from "vitest";

const workspaceConfigPath = path.resolve(
  import.meta.dirname,
  "../../pnpm-workspace.yaml",
);
const workspaceRoot = path.dirname(workspaceConfigPath);

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

it.each([
  [
    "workspace:./packages/hyperdb",
    path.resolve(workspaceRoot, "packages/hyperdb"),
  ],
  [
    "workspace:../hyperdb/packages/hyperdb",
    path.resolve(workspaceRoot, "../hyperdb/packages/hyperdb"),
  ],
  ...[
    "workspace:*",
    "workspace:^",
    "workspace:~",
    "workspace:^0.8.0",
    "workspace:0.8.0",
  ].map(
    (override) =>
      [
        override,
        fs.realpathSync(
          path.resolve(
            import.meta.dirname,
            "node_modules/@will-be-done/hyperdb",
          ),
        ),
      ] as const,
  ),
  [
    "link:../hyperdb/packages/hyperdb",
    path.resolve(workspaceRoot, "../hyperdb/packages/hyperdb"),
  ],
  ["file:./packages/hyperdb", path.resolve(workspaceRoot, "packages/hyperdb")],
  [undefined, undefined],
  ["^0.8.0", undefined],
] as const)(
  "resolves the HyperDB alias for %s",
  async (override, expectedRoot) => {
    const readFileSync = fs.readFileSync;
    vi.spyOn(fs, "readFileSync").mockImplementation((file, options) =>
      file === workspaceConfigPath
        ? override
          ? `overrides:\n  "@will-be-done/hyperdb": "${override}"\n`
          : "overrides: {}\n"
        : readFileSync(file, options),
    );

    const { default: config } = await import("./vite.config");
    const aliases = config.resolve?.alias;
    if (!Array.isArray(aliases)) throw new Error("Expected an alias array");
    const hyperdbAliases = aliases.filter(
      ({ find }) =>
        find instanceof RegExp && find.test("@will-be-done/hyperdb"),
    );

    expect(hyperdbAliases.map(({ replacement }) => replacement)).toEqual(
      expectedRoot ? [path.resolve(expectedRoot, "src/index.ts")] : [],
    );
  },
);

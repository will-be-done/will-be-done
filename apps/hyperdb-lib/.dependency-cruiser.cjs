/** @type {import("dependency-cruiser").IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment:
        "Detects runtime and type-only import cycles. Keep tsPreCompilationDeps enabled so TypeScript-only edges are included.",
      from: {},
      to: {
        circular: true,
      },
    },
  ],
  options: {
    doNotFollow: {
      path: ["node_modules", "dist"],
    },
    includeOnly: ["^src"],
    moduleSystems: ["es6"],
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.eslint.json",
    },
    enhancedResolveOptions: {
      conditionNames: ["import", "require", "node", "default", "types"],
      extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
      exportsFields: ["exports"],
      mainFields: ["module", "main", "types", "typings"],
    },
    skipAnalysisNotInRules: true,
  },
};

const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");

const config = getDefaultConfig(__dirname);

// Workspace packages (slices, client) carry their own install of HyperDB and
// React. Resolve these from the app so the bundle holds exactly one instance.
const appSingletons = ["react", "@will-be-done/hyperdb"];
const appOrigin = path.join(__dirname, "package.json");
const resolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const isSingleton = appSingletons.some(
    (name) => moduleName === name || moduleName.startsWith(`${name}/`),
  );
  const nextContext = isSingleton
    ? { ...context, originModulePath: appOrigin }
    : context;
  return (resolveRequest ?? context.resolveRequest)(
    nextContext,
    moduleName,
    platform,
  );
};

module.exports = withUniwindConfig(config, {
  cssEntryFile: "./global.css",
  dtsFile: "./uniwind-types.d.ts",
});

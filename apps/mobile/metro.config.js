// Expo SDK 52+ auto-configures Metro for npm-workspace monorepos (watchFolders + nodeModulesPaths).
// @falcon/shared is consumed as TypeScript source via the workspace.
//
// Windows fix: npm creates the node_modules/@falcon/* junctions with whatever drive-letter case the install ran
// under (VS Code uses lowercase `c:`). Metro compares paths case-sensitively, so a `c:\` junction target is
// "outside" a `C:\` project and the package can't be resolved. Mapping the package by path avoids the junction.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const sharedDir = path.resolve(__dirname, '../../packages/shared');

config.resolver.extraNodeModules = { ...(config.resolver.extraNodeModules ?? {}), '@falcon/shared': sharedDir };
config.watchFolders = [...new Set([...(config.watchFolders ?? []), sharedDir])];
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@falcon/shared') {
    return context.resolveRequest(context, path.join(sharedDir, 'src/index.ts'), platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

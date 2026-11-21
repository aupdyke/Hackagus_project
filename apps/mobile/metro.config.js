// Expo SDK 52+ auto-configures Metro for npm-workspace monorepos (watchFolders + nodeModulesPaths).
// @falcon/shared is consumed as TypeScript source via the workspace symlink.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);

// Expo SDK 52+ configures Metro for monorepos automatically (watchFolders, node_modules lookup).
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);

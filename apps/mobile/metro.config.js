// Expo's default Metro config detects the pnpm workspace and watches/resolves workspace packages itself.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);

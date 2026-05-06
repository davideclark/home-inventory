const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts = config.resolver.assetExts.filter(ext => ext !== 'sql');
config.resolver.sourceExts.push('sql');

module.exports = config;

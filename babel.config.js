module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Do NOT add 'react-native-reanimated/plugin' here: babel-preset-expo (SDK 54)
    // already appends it when react-native-reanimated is installed. A duplicate
    // plugin causes "Exception in HostFunction" / worklet crashes in Expo Go.
  };
};

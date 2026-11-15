/* global jest */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));

// shortcut: Reanimated 4.7's own mock and setUpTests() load the native initializer and throw under
// jest-expo ("setCSSEventHandler is not available in JSReanimated"). Minimal static stand-in for
// the API the components use; extend it when a component uses more, or switch back to
// require('react-native-reanimated/mock') once that works with jest-expo.
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const id = (v) => v;
  const Animated = { View, createAnimatedComponent: id };
  const layout = { duration: () => layout, delay: () => layout };
  return {
    __esModule: true,
    default: Animated,
    ...Animated,
    useSharedValue: (v) => ({ value: v }),
    useAnimatedStyle: (fn) => fn(),
    withTiming: id,
    withRepeat: id,
    withDelay: (_d, v) => v,
    withSequence: (...v) => v[v.length - 1],
    cancelAnimation: () => undefined,
    Easing: { inOut: id, sin: id, linear: id, ease: id },
    FadeInDown: layout,
    FadeOutDown: layout,
  };
});

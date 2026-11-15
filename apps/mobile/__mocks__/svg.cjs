// SVG files are React components at runtime (react-native-svg-transformer); in Jest a stub.
const { View } = require('react-native');
const React = require('react');
module.exports = function SvgMock(props) {
  return React.createElement(View, { testID: 'svg', ...props });
};
module.exports.default = module.exports;

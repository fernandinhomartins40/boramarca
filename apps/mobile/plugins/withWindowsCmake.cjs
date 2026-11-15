// Config plugin: writes android/local.properties with sdk.dir and cmake.dir so the Windows
// 260-character workaround survives `expo prebuild --clean` (README, "Windows e o limite de 260
// caracteres"). It needs CMake >= 4.1 installed through the SDK Manager (it ships ninja 1.12, which
// handles long paths); without it, nothing is written for cmake.dir and the default CMake 3.22.1
// fails on Windows. Off Windows (EAS on Linux, macOS) the plugin does nothing.
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const MIN = [4, 1];

const parse = (v) => v.split('.').map((n) => parseInt(n, 10) || 0);
const atLeast = (v, min) => {
  for (let i = 0; i < min.length; i++) if ((v[i] ?? 0) !== min[i]) return (v[i] ?? 0) > min[i];
  return true;
};
const newest = (a, b) => {
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++)
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0) ? a : b;
  return a;
};
// local.properties is a Java properties file: escape backslashes and colons
const esc = (p) => p.replace(/\\/g, '\\\\').replace(/:/g, '\\:');

function sdkDir() {
  const env = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (env) return env;
  if (process.env.LOCALAPPDATA) return path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk');
  return null;
}

/** Newest CMake >= 4.1 in <sdk>/cmake, or null. */
function findCmake(sdk) {
  const dir = path.join(sdk, 'cmake');
  if (!fs.existsSync(dir)) return null;
  const versions = fs.readdirSync(dir).filter((v) => /^\d+(\.\d+)*$/.test(v) && atLeast(parse(v), MIN));
  return versions.length ? path.join(dir, versions.reduce(newest)) : null;
}

function withWindowsCmake(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      if (process.platform !== 'win32') return cfg;
      const sdk = sdkDir();
      if (!sdk || !fs.existsSync(sdk)) return cfg;
      const file = path.join(cfg.modRequest.platformProjectRoot, 'local.properties');
      const kept = fs.existsSync(file)
        ? fs
            .readFileSync(file, 'utf8')
            .split(/\r?\n/)
            .filter((l) => l && !/^(sdk|cmake)\.dir=/.test(l))
        : [];
      const cmake = findCmake(sdk);
      if (!cmake)
        console.warn(
          '[withWindowsCmake] CMake >= 4.1 not found in the Android SDK: install it in the SDK Manager (README).',
        );
      const lines = [
        ...kept,
        `sdk.dir=${esc(sdk)}`,
        ...(cmake ? [`cmake.dir=${esc(cmake)}`] : []),
      ];
      fs.writeFileSync(file, `${lines.join('\n')}\n`);
      return cfg;
    },
  ]);
}

module.exports = withWindowsCmake;

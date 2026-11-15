// Config plugin: bundles the Picovoice files of the "Ei, Bora Marca" wake word, when present in
// assets/wakeword/ (generated in the Picovoice Console; docs/pendencias/D2.md):
//   ei-bora-marca_android.ppn, ei-bora-marca_ios.ppn  (keyword, one per platform, Portuguese)
//   porcupine_params_pt.pv                            (Portuguese model)
// Android: copied to app/src/main/assets (Porcupine resolves paths relative to it).
// iOS: copied next to the app sources and added to the bundle resources (resolved from the bundle).
// It also writes extra.wakeWord so the app only turns Porcupine on where the files exist.
const fs = require('fs');
const path = require('path');
const { IOSConfig, withDangerousMod, withXcodeProject } = require('expo/config-plugins');

const DIR = 'assets/wakeword';
const MODEL = 'porcupine_params_pt.pv';
const KEYWORD = { android: 'ei-bora-marca_android.ppn', ios: 'ei-bora-marca_ios.ppn' };

const has = (root, file) => fs.existsSync(path.join(root, DIR, file));
const filesFor = (platform) => [KEYWORD[platform], MODEL];

function copy(root, files, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const f of files) fs.copyFileSync(path.join(root, DIR, f), path.join(dest, f));
}

module.exports = function withWakeWord(config) {
  const root = path.join(__dirname, '..');
  const ready = (p) => filesFor(p).every((f) => has(root, f));
  config.extra = {
    ...config.extra,
    wakeWord: {
      android: ready('android') ? { keyword: KEYWORD.android, model: MODEL } : false,
      ios: ready('ios') ? { keyword: KEYWORD.ios, model: MODEL } : false,
    },
  };

  if (ready('android')) {
    config = withDangerousMod(config, [
      'android',
      (cfg) => {
        const dest = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/assets');
        copy(cfg.modRequest.projectRoot, filesFor('android'), dest);
        return cfg;
      },
    ]);
  }
  if (ready('ios')) {
    config = withDangerousMod(config, [
      'ios',
      (cfg) => {
        const name = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot);
        copy(cfg.modRequest.projectRoot, filesFor('ios'), path.join(cfg.modRequest.platformProjectRoot, name));
        return cfg;
      },
    ]);
    config = withXcodeProject(config, (cfg) => {
      const name = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot);
      for (const f of filesFor('ios')) {
        if (cfg.modResults.hasFile(`${name}/${f}`)) continue;
        IOSConfig.XcodeUtils.addResourceFileToGroup({
          filepath: `${name}/${f}`,
          groupName: name,
          isBuildFile: true,
          project: cfg.modResults,
        });
      }
      return cfg;
    });
  }
  return config;
};

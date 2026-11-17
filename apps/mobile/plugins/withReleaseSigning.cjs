// Config plugin: the Android release is signed with the upload key when BORAMARCA_UPLOAD_STORE_FILE
// is set (CI, .github/workflows/apps-nativos.yml); without it the release keeps the debug key (test
// builds only — the Play Store refuses it). Key values come from the environment, never from the repo.
const { withAppBuildGradle } = require('expo/config-plugins');

const UPLOAD = `signingConfigs {
        upload {
            def store = System.getenv('BORAMARCA_UPLOAD_STORE_FILE')
            storeFile store ? file(store) : null
            storePassword System.getenv('BORAMARCA_UPLOAD_STORE_PASSWORD')
            keyAlias System.getenv('BORAMARCA_UPLOAD_KEY_ALIAS')
            keyPassword System.getenv('BORAMARCA_UPLOAD_KEY_PASSWORD')
        }`;

function applySigning(gradle) {
  if (gradle.includes('BORAMARCA_UPLOAD_STORE_FILE')) return gradle;
  const out = gradle
    .replace(/signingConfigs\s*\{/, UPLOAD)
    .replace(
      /(buildTypes\s*\{[\s\S]*?release\s*\{[^}]*?)signingConfig signingConfigs\.debug/,
      "$1signingConfig System.getenv('BORAMARCA_UPLOAD_STORE_FILE') ? signingConfigs.upload : signingConfigs.debug",
    );
  if (!out.includes('signingConfigs.upload :')) {
    throw new Error('withReleaseSigning: release block of app/build.gradle not found');
  }
  return out;
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = applySigning(cfg.modResults.contents);
    return cfg;
  });
};
module.exports.applySigning = applySigning;

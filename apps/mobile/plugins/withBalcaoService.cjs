// Config plugin: Modo Balcão foreground service (modules/balcao-service) in the app manifest.
// Android 14+: a "microphone" foreground service needs the type on <service>,
// FOREGROUND_SERVICE + FOREGROUND_SERVICE_MICROPHONE, and RECORD_AUDIO granted at runtime.
// WAKE_LOCK keeps the CPU on for the wake word with the screen off.
const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

const SERVICE = 'br.com.boramarca.balcao.BalcaoService';
const PERMISSIONS = [
  'android.permission.RECORD_AUDIO',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MICROPHONE',
  'android.permission.WAKE_LOCK',
];

module.exports = function withBalcaoService(config) {
  config = AndroidConfig.Permissions.withPermissions(config, PERMISSIONS);
  return withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.service = (app.service ?? []).filter((s) => s.$['android:name'] !== SERVICE);
    app.service.push({
      $: {
        'android:name': SERVICE,
        'android:exported': 'false',
        'android:foregroundServiceType': 'microphone',
      },
    });
    return cfg;
  });
};

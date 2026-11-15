package br.com.boramarca.balcao

import android.content.Context
import android.content.Intent
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** JS bridge of the Modo Balcão service, media volume and audio route (Android only). */
class BalcaoServiceModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context not ready" }

  private val audio: AudioManager
    get() = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

  private val deviceCallback = object : AudioDeviceCallback() {
    override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) = emitRoute()
    override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) = emitRoute()
  }

  private fun route(): Map<String, Any?> {
    val bt = audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS).firstOrNull { isBluetoothOutput(it) }
    return mapOf("bluetooth" to (bt != null), "name" to bt?.productName?.toString())
  }

  private fun emitRoute() = sendEvent("onAudioRouteChange", route())

  override fun definition() = ModuleDefinition {
    Name("BoraMarcaBalcao")
    Events("onServiceChange", "onAudioRouteChange")

    OnCreate {
      BalcaoService.listener = { running, reason ->
        sendEvent("onServiceChange", mapOf("running" to running, "reason" to reason))
      }
      audio.registerAudioDeviceCallback(deviceCallback, Handler(Looper.getMainLooper()))
    }

    OnDestroy {
      BalcaoService.listener = null
      appContext.reactContext?.let {
        (it.getSystemService(Context.AUDIO_SERVICE) as AudioManager)
          .unregisterAudioDeviceCallback(deviceCallback)
      }
    }

    /** Must be called with the app in the foreground and RECORD_AUDIO granted (Android 14+). */
    Function("start") { title: String, text: String, pauseLabel: String ->
      val intent = Intent(context, BalcaoService::class.java)
        .putExtra(BalcaoService.EXTRA_TITLE, title)
        .putExtra(BalcaoService.EXTRA_TEXT, text)
        .putExtra(BalcaoService.EXTRA_PAUSE, pauseLabel)
      ContextCompat.startForegroundService(context, intent)
    }

    Function("stop") {
      context.stopService(Intent(context, BalcaoService::class.java))
    }

    Function("isRunning") { BalcaoService.running }

    /** Music stream volume, 0–1 (null when the device reports no range). */
    Function("getMediaVolume") {
      val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
      if (max <= 0) null else audio.getStreamVolume(AudioManager.STREAM_MUSIC).toDouble() / max
    }

    Function("getAudioRoute") { route() }

    Function("getKeepSpeakerAwake") { BalcaoService.keepSpeakerAwake(context) }

    Function("setKeepSpeakerAwake") { enabled: Boolean ->
      BalcaoService.setKeepSpeakerAwake(context, enabled)
    }
  }

  private fun isBluetoothOutput(d: AudioDeviceInfo): Boolean {
    if (d.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP) return true
    return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
      (d.type == AudioDeviceInfo.TYPE_BLE_SPEAKER || d.type == AudioDeviceInfo.TYPE_BLE_HEADSET)
  }
}

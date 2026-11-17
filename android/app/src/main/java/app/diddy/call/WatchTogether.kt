package app.diddy.call

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.webkit.WebChromeClient
import android.webkit.WebMessage
import android.webkit.WebMessagePort
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.diddy.app.DiagLog
import app.diddy.app.Prefs
import app.diddy.matrix.MatrixAccount
import app.diddy.util.Http
import app.diddy.util.Json
import app.diddy.util.friendlyMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.matrix.rustcomponents.sdk.TaskHandle
import org.matrix.rustcomponents.sdk.ToDeviceMessage
import org.matrix.rustcomponents.sdk.ToDeviceMessageListener
import java.util.UUID

/** The Watch Together options of this device. */
object WatchPrefsStore {
    var prefs by mutableStateOf(WatchPrefs.decode(Prefs.string(WatchPrefs.STORAGE_KEY)))
        private set

    fun update(change: (WatchPrefs) -> WatchPrefs) {
        val next = change(prefs)
        if (next == prefs) return
        prefs = next
        Prefs.setString(WatchPrefs.STORAGE_KEY, next.encode())
    }

    fun setCategory(category: String, on: Boolean) = update { p ->
        val rest = p.categories.filter { it != category }
        p.copy(categories = if (on) rest + category else rest)
    }
}

/**
 * One call's shared YouTube video (ios WatchTogetherSession): the state goes to everyone's call
 * devices as to-device messages, encrypted where possible, like desktop and iOS.
 */
class WatchTogetherSession(
    private val account: MatrixAccount,
    val roomId: String,
    private val devices: () -> List<WatchDevice>,
    private val isMember: (String) -> Boolean,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    var available by mutableStateOf(false)
        private set
    var shared by mutableStateOf<SharedWatch?>(null)
        private set
    var closedSession by mutableStateOf<String?>(null)
        private set
    var toast by mutableStateOf<String?>(null)
        private set
    private var handle: TaskHandle? = null
    private var toastJob: Job? = null
    private val ownUserId = account.userId

    companion object {
        val nowMs: Double get() = System.currentTimeMillis().toDouble()
    }

    val running: Boolean get() = shared?.let { it.state != WatchPlayback.STOPPED } ?: false

    fun start() {
        if (handle != null || !WatchPrefsStore.prefs.enabled) return
        handle = account.client.subscribeToCustomToDeviceMessages(listOf(WatchProtocol.EVENT_TYPE), object : ToDeviceMessageListener {
            override fun onMessage(message: ToDeviceMessage) {
                scope.launch { receive(message) }
            }
        })
        available = true
        ask()
        scope.launch {
            delay(4000)
            if (handle != null && shared == null) ask()
        }
    }

    fun stop() {
        handle?.cancel()
        handle = null
        available = false
        shared = null
        closedSession = null
        toast = null
        scope.cancel()
    }

    private fun receive(message: ToDeviceMessage) {
        if (handle == null || message.eventType != WatchProtocol.EVENT_TYPE || message.senderId == ownUserId) return
        val msg = WatchProtocol.parse(message.content) ?: return
        val sender = message.senderId
        when (msg) {
            is WatchMessage.Request -> {
                if (msg.room != roomId || !isMember(sender)) return
                val current = shared ?: return
                if (current.state != WatchPlayback.STOPPED) send(WatchProtocol.stateContent(roomId, WatchProtocol.rebase(current, nowMs)), onlyUser = sender)
            }
            is WatchMessage.State -> {
                if (msg.state.room != roomId || !isMember(sender)) return
                val previous = shared
                val next = WatchProtocol.fromMessage(msg.state, sender, nowMs)
                if (!WatchProtocol.isNewer(next, previous)) return
                shared = next
                if (next.state != WatchPlayback.STOPPED && previous?.session != next.session) showToast("${account.name(sender)} started watching together")
                else if (next.state == WatchPlayback.STOPPED && previous != null && previous.state != WatchPlayback.STOPPED) showToast("${account.name(sender)} stopped the video")
            }
        }
    }

    fun startWatching(videoId: String, start: Double) {
        if (handle == null) return
        publish(WatchProtocol.startWatch(videoId, start, shared, ownUserId, nowMs))
        closedSession = null
    }

    fun change(patch: WatchPatch) {
        val current = shared ?: return
        if (handle == null || current.state == WatchPlayback.STOPPED) return
        publish(WatchProtocol.nextChange(current, patch, ownUserId, nowMs))
    }

    fun stopForEveryone() = change(WatchPatch(state = WatchPlayback.STOPPED))

    fun closeForMe() {
        shared?.let { closedSession = it.session }
    }

    fun reopen() {
        closedSession = null
    }

    fun showToast(text: String) {
        toast = text
        toastJob?.cancel()
        toastJob = scope.launch {
            delay(4000)
            if (toast == text) toast = null
        }
    }

    private fun publish(next: SharedWatch) {
        shared = next
        send(WatchProtocol.stateContent(roomId, next))
    }

    private fun ask() = send(WatchProtocol.requestContent(roomId))

    private fun send(content: Map<String, Any?>, onlyUser: String? = null) {
        val recipients = WatchProtocol.recipients(devices(), ownUserId, onlyUser)
        if (recipients.isEmpty()) return
        val json = Json.encode(content)
        scope.launch {
            val plain = try {
                account.client.sendEncryptedToDeviceMessage(WatchProtocol.EVENT_TYPE, recipients, json).failures
            } catch (e: Exception) {
                DiagLog.write("watchTogether: encrypted send failed, sending plain: ${e.friendlyMessage}")
                recipients
            }
            if (WatchProtocol.deviceCount(plain) == 0) return@launch
            val txn = "diddywatch" + UUID.randomUUID().toString().replace("-", "")
            runCatching {
                account.clientRequest("/_matrix/client/v3/sendToDevice/${WatchProtocol.EVENT_TYPE}/$txn", mapOf("messages" to WatchProtocol.plainMessages(plain, content)), "PUT")
            }.onFailure { DiagLog.write("watchTogether: send failed: ${it.message}") }
        }
    }
}

/**
 * The YouTube player of one shared video (ios WatchPlayerHost): the official embed in an iframe
 * of a host page with the embed's origin; the page talks to the app over a WebMessagePort.
 */
@SuppressLint("SetJavaScriptEnabled")
class WatchPlayerHost(context: Context, private val first: SharedWatch) {
    private class InfoState(var currentTime: Double = 0.0, var receivedAt: Double = 0.0, var state: Int = WatchPlayerState.UNSTARTED, var rate: Double = 1.0, var duration: Double? = null)

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val appContext = context.applicationContext
    var ready by mutableStateOf(false)
        private set
    var errorCode by mutableStateOf<Int?>(null)
        private set
    var reportedQuality by mutableStateOf<String?>(null)
        private set
    var onChange: ((WatchPatch) -> Unit)? = null
    var onToast: ((String) -> Unit)? = null

    private val controller = WatchController()
    private var shared: SharedWatch = first
    private val info = InfoState()
    private var segments: List<WatchSkipSegment> = emptyList()
    private var segmentJob: Job? = null
    private var tickJob: Job? = null
    private var qualityChoice = "auto"
    private var port: WebMessagePort? = null
    private var destroyed = false

    val webView: WebView = WebView(context).apply {
        setBackgroundColor(Color.BLACK)
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        settings.setSupportMultipleWindows(false)
        webChromeClient = WebChromeClient()
        webViewClient = object : WebViewClient() {
            private var loaded = false
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (!request.isForMainFrame) return false
                // A link out of the player (the YouTube logo): open it in the YouTube app or browser.
                val host = request.url.host?.lowercase() ?: return true
                if (request.url.scheme == "https" && (host == "youtube.com" || host.endsWith(".youtube.com") || host == "youtu.be")) {
                    runCatching { appContext.startActivity(Intent(Intent.ACTION_VIEW, request.url).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                }
                return true
            }

            override fun onPageFinished(view: WebView, url: String?) {
                if (loaded) return
                loaded = true
                connect()
            }
        }
    }

    fun start(prefs: WatchPrefs) {
        qualityChoice = prefs.quality
        controller.setShared(shared)
        webView.loadDataWithBaseURL(WatchYouTube.EMBED_ORIGIN + "/", HOST_PAGE, "text/html", "utf-8", null)
        loadSegments(prefs.categories)
    }

    fun destroy() {
        if (destroyed) return
        destroyed = true
        scope.cancel()
        onChange = null
        onToast = null
        port?.close()
        webView.stopLoading()
        webView.destroy()
    }

    fun update(next: SharedWatch) {
        shared = next
        controller.setShared(next)
        tick()
    }

    fun apply(volume: Int, muted: Boolean, quality: String) {
        qualityChoice = quality
        if (!ready) return
        post(WatchYouTube.playerCommand("setVolume", listOf(volume)))
        post(WatchYouTube.playerCommand(if (muted) "mute" else "unMute"))
        if (quality != "auto") post(WatchYouTube.playerCommand("setPlaybackQuality", listOf(quality)))
    }

    fun setCategories(categories: List<String>) = loadSegments(categories)

    private fun connect() {
        val channel = runCatching { webView.createWebMessageChannel() }.getOrNull() ?: return
        channel[0].setWebMessageCallback(object : WebMessagePort.WebMessageCallback() {
            override fun onMessage(port: WebMessagePort, message: WebMessage) {
                val text = message.data ?: return
                webView.post { receive(text) }
            }
        })
        port = channel[0]
        webView.postWebMessage(WebMessage("diddy-port", arrayOf(channel[1])), Uri.parse(WatchYouTube.EMBED_ORIGIN))
        val now = WatchTogetherSession.nowMs
        val src = WatchYouTube.embedUrl(shared.videoId, WatchYouTube.EMBED_ORIGIN, WatchProtocol.expectedPosition(shared, now))
        if (src == null) {
            errorCode = 2
            return
        }
        send(mapOf("cmd" to "load", "src" to src))
    }

    private fun send(command: Map<String, Any?>) {
        runCatching { port?.postMessage(WebMessage(Json.encode(command))) }
    }

    private fun post(message: String) = send(mapOf("cmd" to "post", "m" to message))

    private fun position(now: Double): Double =
        info.currentTime + if (info.state == WatchPlayerState.PLAYING) (now - info.receivedAt) / 1000 * info.rate else 0.0

    private fun run(commands: List<WatchPlayerCommand>, now: Double) {
        for (command in commands) when (command) {
            is WatchPlayerCommand.Seek -> {
                post(WatchYouTube.playerCommand("seekTo", listOf(command.to, true)))
                info.currentTime = command.to
                info.receivedAt = now
            }
            WatchPlayerCommand.Play -> post(WatchYouTube.playerCommand("playVideo"))
            WatchPlayerCommand.Pause -> post(WatchYouTube.playerCommand("pauseVideo"))
            is WatchPlayerCommand.Rate -> post(WatchYouTube.playerCommand("setPlaybackRate", listOf(command.rate)))
        }
    }

    private fun tick() {
        if (!ready || destroyed) return
        val now = WatchTogetherSession.nowMs
        val result = controller.tick(WatchPlayerSample(position(now), info.state, info.rate, info.duration, now), now, segments)
        run(result.commands, now)
        result.change?.let { onChange?.invoke(it) }
        result.skipped?.let { onToast?.invoke("Skipped ${(WatchSponsorBlock.labels[it.category] ?: it.category).lowercase()} segment (SponsorBlock)") }
    }

    private fun becomeReady() {
        if (ready) return
        ready = true
        for (name in listOf("onStateChange", "onError", "onPlaybackRateChange", "onPlaybackQualityChange")) {
            post(WatchYouTube.playerCommand("addEventListener", listOf(name)))
        }
        val prefs = WatchPrefsStore.prefs
        apply(prefs.volume, prefs.muted, prefs.quality)
        controller.setShared(shared)
        tick()
        tickJob?.cancel()
        tickJob = scope.launch {
            while (isActive) {
                delay(500)
                tick()
            }
        }
    }

    private fun loadSegments(categories: List<String>) {
        segmentJob?.cancel()
        segments = emptyList()
        val videoId = shared.videoId
        if (!WatchYouTube.isVideoId(videoId) || categories.isEmpty()) return
        val url = WatchSponsorBlock.requestUrl(WatchSponsorBlock.hashPrefix(videoId), categories)
        segmentJob = scope.launch {
            val answer = runCatching { Http.request(url) }.getOrNull() ?: return@launch
            if (answer.status != 200) return@launch
            segments = WatchSponsorBlock.selectSegments(Json.parse(answer.text), videoId, categories)
        }
    }

    private fun receive(text: String) {
        if (destroyed) return
        val parsed = WatchPlayerMessages.parse(text) ?: return
        val now = WatchTogetherSession.nowMs
        when (parsed) {
            WatchPlayerMessage.Ready -> becomeReady()
            is WatchPlayerMessage.Info -> {
                if (!ready) becomeReady()
                val reported = parsed.info
                reported.currentTime?.let { info.currentTime = it; info.receivedAt = now }
                reported.playerState?.let { info.state = it }
                reported.playbackRate?.let { info.rate = it }
                reported.duration?.takeIf { it > 0 }?.let { info.duration = it }
                reported.playbackQuality?.let { reportedQuality = it }
            }
            is WatchPlayerMessage.State -> {
                info.currentTime = position(now)
                info.receivedAt = now
                info.state = parsed.state
                controller.onPlayerState(parsed.state, info.currentTime, now)?.let { onChange?.invoke(it) }
                if (parsed.state == WatchPlayerState.PLAYING) {
                    if (qualityChoice != "auto") post(WatchYouTube.playerCommand("setPlaybackQuality", listOf(qualityChoice)))
                    errorCode = null
                }
            }
            is WatchPlayerMessage.Rate -> {
                info.rate = parsed.rate
                controller.onPlayerRate(parsed.rate, now)?.let { onChange?.invoke(it) }
            }
            is WatchPlayerMessage.Quality -> reportedQuality = parsed.quality
            is WatchPlayerMessage.Error -> errorCode = parsed.code
        }
    }

    companion object {
        private val HOST_PAGE = """
            <!doctype html><html><head><meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>html,body{margin:0;padding:0;height:100%;background:#000;overflow:hidden}
            iframe{display:block;border:0;width:100%;height:100%;background:#000}</style>
            </head><body><script>
            (function () {
              "use strict";
              var ORIGINS = ["https://www.youtube-nocookie.com", "https://www.youtube.com", "https://youtube.com"];
              var TARGET = ORIGINS[0];
              var LISTEN = '{"event":"listening","id":1,"channel":"widget"}';
              var MAX = 100000;
              var port = null, frame = null, tries = 0, timer = null, heard = false;
              function post(message) {
                if (frame && frame.contentWindow) { try { frame.contentWindow.postMessage(message, TARGET); } catch (e) {} }
              }
              function listen() {
                if (heard || tries >= 60) { return; }
                tries += 1;
                post(LISTEN);
                timer = setTimeout(listen, 250);
              }
              function load(src) {
                if (frame) { frame.remove(); frame = null; }
                clearTimeout(timer); tries = 0; heard = false;
                var f = document.createElement("iframe");
                f.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture; fullscreen");
                f.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
                f.setAttribute("allowfullscreen", "");
                f.setAttribute("title", "YouTube video player");
                f.addEventListener("load", function () { tries = 0; clearTimeout(timer); listen(); });
                f.src = src;
                document.body.appendChild(f);
                frame = f;
                listen();
              }
              function fromApp(event) {
                var command;
                try { command = JSON.parse(event.data); } catch (e) { return; }
                if (command.cmd === "load") { load(command.src); }
                else if (command.cmd === "post") { post(command.m); }
              }
              window.addEventListener("message", function (event) {
                if (!port && !frame && event.data === "diddy-port" && event.ports && event.ports.length === 1) {
                  port = event.ports[0];
                  port.onmessage = fromApp;
                  return;
                }
                if (!port || !frame || event.source !== frame.contentWindow || ORIGINS.indexOf(event.origin) < 0) { return; }
                var text = event.data;
                if (typeof text !== "string" || text.length > MAX) { return; }
                heard = true;
                clearTimeout(timer);
                port.postMessage(text);
              });
            })();
            </script></body></html>
        """.trimIndent()
    }
}

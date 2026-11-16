package app.diddy.plugins

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.webkit.WebMessage
import android.webkit.WebMessagePort
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.diddy.app.DiagLog
import app.diddy.util.Json
import java.util.Locale

/**
 * Runs one plugin page like the desktop (`PluginFrame.tsx`) and iOS (`PluginHost.swift`): the
 * unchanged plugin HTML sits in an `<iframe sandbox="allow-scripts">` (opaque origin, nothing of
 * the app) inside a tiny host page. The host page talks to the app over a WebMessagePort that only
 * the host page receives, before the plugin frame exists; there is no JavaScript interface at all.
 * Every message is checked by [PluginMessageParser] before anything happens.
 */
@SuppressLint("SetJavaScriptEnabled")
class PluginHost(context: Context, private val pluginId: String?) {
    var height by mutableStateOf(PluginRules.DEFAULT_FRAME_HEIGHT)
        private set
    var isReady by mutableStateOf(false)
        private set
    var description by mutableStateOf<String?>(null)
        private set

    var theme: String = "dark"
        set(value) { if (field != value) { field = value; sendInitIfReady() } }
    var compact: Boolean = false
        set(value) { if (field != value) { field = value; sendInitIfReady() } }
    var customCss: String? = null
        set(value) { if (field != value) { field = value; sendInitIfReady() } }

    private var port: WebMessagePort? = null
    private var source: Pair<String, String>? = null
    private val appContext = context.applicationContext

    val webView: WebView = WebView(context).apply {
        setBackgroundColor(Color.TRANSPARENT)
        settings.javaScriptEnabled = true
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        settings.domStorageEnabled = false
        settings.setSupportMultipleWindows(false)
        settings.javaScriptCanOpenWindowsAutomatically = false
        settings.mediaPlaybackRequiresUserGesture = true
        settings.setGeolocationEnabled(false)
        isVerticalScrollBarEnabled = false
        android.webkit.CookieManager.getInstance().setAcceptThirdPartyCookies(this, false)
        webViewClient = object : WebViewClient() {
            // The host page never navigates; links go through diddy:open.
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = request.isForMainFrame

            override fun onPageFinished(view: WebView, url: String?) {
                connect()
            }
        }
    }

    fun load(kind: String, value: String) {
        source = kind to value
        isReady = false
        description = null
        height = PluginRules.DEFAULT_FRAME_HEIGHT
        port?.close()
        port = null
        webView.loadDataWithBaseURL(HOST_ORIGIN + "/", hostPage, "text/html", "utf-8", null)
    }

    fun reload() {
        source?.let { load(it.first, it.second) }
    }

    fun destroy() {
        port?.close()
        port = null
        webView.stopLoading()
        webView.destroy()
    }

    private fun connect() {
        if (port != null) return
        val (kind, value) = source ?: return
        val channel = try { webView.createWebMessageChannel() } catch (e: Exception) { DiagLog.write("plugin: no message channel (${e.message})"); return }
        val mine = channel[0]
        mine.setWebMessageCallback(object : WebMessagePort.WebMessageCallback() {
            override fun onMessage(port: WebMessagePort, message: WebMessage) {
                val text = message.data ?: return
                webView.post { receive(text) }
            }
        })
        port = mine
        webView.postWebMessage(WebMessage("diddy-port", arrayOf(channel[1])), Uri.parse(HOST_ORIGIN))
        send(mapOf("cmd" to "load", "kind" to kind, "value" to value))
    }

    private fun send(command: Map<String, Any?>) {
        runCatching { port?.postMessage(WebMessage(Json.encode(command))) }
    }

    private fun post(message: Map<String, Any?>) = send(mapOf("cmd" to "post", "m" to message))

    private fun sendInit() = post(PluginMessageParser.initMessage(theme, Locale.getDefault().toLanguageTag(), compact, customCss))

    private fun sendInitIfReady() {
        if (isReady) sendInit()
    }

    private fun receive(text: String) {
        when (val message = PluginMessageParser.parse(text) ?: return) {
            is PluginMessage.Ready -> {
                isReady = true
                description = message.description
                message.height?.let { height = it }
                sendInit()
            }
            is PluginMessage.Resize -> height = message.height
            is PluginMessage.StorageGet -> {
                val value = pluginId?.let { PluginStore.value(it, message.key) }
                post(mapOf("type" to "diddy:storage:value", "id" to message.id, "key" to message.key, "value" to value))
            }
            is PluginMessage.StorageSet -> pluginId?.let { PluginStore.setValue(it, message.key, message.value) }
            is PluginMessage.Open -> runCatching {
                appContext.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(message.url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
        }
    }

    companion object {
        private const val HOST_ORIGIN = "https://plugin-host.diddy.invalid"

        /** Same limits as the desktop app's CSP; the sandboxed frame inherits them. */
        private val csp = listOf(
            "default-src data: blob: https:",
            "script-src 'unsafe-inline' data: blob: https:",
            "style-src 'unsafe-inline' data: https:",
            "img-src data: blob: https:",
            "media-src data: blob: https:",
            "font-src data: https:",
            "connect-src https: wss:",
            "frame-src https:",
            "object-src 'none'",
            "base-uri 'none'",
            "form-action 'none'",
        ).joinToString("; ")

        private val hostPage = """
            <!doctype html><html><head><meta charset="utf-8">
            <meta http-equiv="Content-Security-Policy" content="$csp">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <meta name="color-scheme" content="light dark">
            <style>html,body{margin:0;padding:0;height:100%;background:transparent;overflow:hidden}
            iframe{display:block;border:0;width:100%;height:100%;background:transparent}</style>
            </head><body><script>
            (function () {
              "use strict";
              var DENIED = "camera 'none'; microphone 'none'; geolocation 'none'; display-capture 'none'; clipboard-read 'none'; clipboard-write 'none'; payment 'none'; usb 'none'; fullscreen 'none'";
              var MAX = 40000;
              var port = null;
              var frame = null;
              function load(kind, value) {
                if (frame) { frame.remove(); frame = null; }
                var f = document.createElement("iframe");
                f.setAttribute("sandbox", "allow-scripts");
                f.setAttribute("referrerpolicy", "no-referrer");
                f.setAttribute("allow", DENIED);
                f.setAttribute("title", "plugin");
                if (kind === "html") { f.srcdoc = value; } else { f.src = value; }
                document.body.appendChild(f);
                frame = f;
              }
              function fromApp(event) {
                var command;
                try { command = JSON.parse(event.data); } catch (e) { return; }
                if (command.cmd === "load") { load(command.kind, command.value); }
                else if (command.cmd === "post" && frame && frame.contentWindow) { frame.contentWindow.postMessage(command.m, "*"); }
              }
              window.addEventListener("message", function (event) {
                // The app's port arrives once, before any plugin frame exists.
                if (!port && !frame && event.data === "diddy-port" && event.ports && event.ports.length === 1) {
                  port = event.ports[0];
                  port.onmessage = fromApp;
                  return;
                }
                if (!port || !frame || event.source !== frame.contentWindow) { return; }
                var text;
                try { text = JSON.stringify(event.data); } catch (e) { return; }
                if (typeof text !== "string" || text.length > MAX) { return; }
                port.postMessage(text);
              });
            })();
            </script></body></html>
        """.trimIndent()
    }
}

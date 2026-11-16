package app.diddy

import android.app.Application
import app.diddy.app.ChatSettings
import app.diddy.app.CustomSounds
import app.diddy.app.DiagLog
import app.diddy.app.Prefs
import app.diddy.app.Sounds
import app.diddy.matrix.EmojiCatalog
import app.diddy.matrix.SessionStore
import app.diddy.media.MediaLoader
import app.diddy.media.VoicePlayer
import app.diddy.ui.theme.ThemeStore
import kotlin.concurrent.thread

class DiddyApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        Prefs.init(this)
        DiagLog.setUp(this)
        SessionStore.context = this
        ChatSettings.appContext = this
        ThemeStore.load()
        Sounds.init(this)
        CustomSounds.init(this)
        VoicePlayer.init(this)
        MediaLoader.install(this)
        Wiring.install(this)
        thread(name = "emoji") { EmojiCatalog.load(this) }
    }
}

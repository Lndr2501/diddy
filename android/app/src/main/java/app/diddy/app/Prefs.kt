package app.diddy.app

import android.content.Context
import android.content.SharedPreferences

/** The app's small settings store, like UserDefaults on iOS. Never holds secrets. */
object Prefs {
    private lateinit var prefs: SharedPreferences

    fun init(context: Context) {
        prefs = context.getSharedPreferences("diddy", Context.MODE_PRIVATE)
    }

    val store: SharedPreferences get() = prefs

    fun string(key: String): String? = prefs.getString(key, null)
    fun setString(key: String, value: String?) = prefs.edit().apply { if (value == null) remove(key) else putString(key, value) }.apply()
    fun bool(key: String, default: Boolean = false): Boolean = prefs.getBoolean(key, default)
    fun setBool(key: String, value: Boolean) = prefs.edit().putBoolean(key, value).apply()
    fun has(key: String): Boolean = prefs.contains(key)
    fun double(key: String, default: Double): Double =
        if (prefs.contains(key)) java.lang.Double.longBitsToDouble(prefs.getLong(key, 0)) else default
    fun setDouble(key: String, value: Double) = prefs.edit().putLong(key, java.lang.Double.doubleToRawLongBits(value)).apply()
    fun int(key: String, default: Int): Int = prefs.getInt(key, default)
    fun setInt(key: String, value: Int) = prefs.edit().putInt(key, value).apply()
    fun remove(key: String) = prefs.edit().remove(key).apply()
}

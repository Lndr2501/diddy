package app.diddy.util

import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener

/**
 * JSON as plain Kotlin maps and lists, the way the iOS app works with `[String: Any]`.
 * Objects become `Map<String, Any?>`, arrays `List<Any?>`, JSON null becomes `null`.
 */
object Json {
    /** Parses any JSON value; null for invalid text. */
    fun parse(text: String?): Any? {
        if (text.isNullOrBlank()) return null
        return try {
            unwrap(JSONTokener(text).nextValue())
        } catch (_: Exception) {
            null
        }
    }

    fun obj(text: String?): Map<String, Any?>? = parse(text).obj()

    fun arr(text: String?): List<Any?>? = parse(text).arr()

    /** Encodes maps, lists, strings, numbers, booleans and null. */
    fun encode(value: Any?): String = when (value) {
        is Map<*, *> -> wrap(value).toString()
        is List<*> -> wrap(value).toString()
        is Array<*> -> wrap(value.toList()).toString()
        else -> JSONObject.quote(value?.toString() ?: "null").let { if (value == null) "null" else if (value is String) it else value.toString() }
    }

    fun wrap(value: Any?): Any? = when (value) {
        null -> JSONObject.NULL
        is Map<*, *> -> JSONObject().also { o -> value.forEach { (k, v) -> o.put(k.toString(), wrap(v)) } }
        is List<*> -> JSONArray().also { a -> value.forEach { a.put(wrap(it)) } }
        is Array<*> -> wrap(value.toList())
        is Set<*> -> wrap(value.toList())
        else -> value
    }

    fun unwrap(value: Any?): Any? = when (value) {
        null, JSONObject.NULL -> null
        is JSONObject -> {
            val map = LinkedHashMap<String, Any?>()
            val keys = value.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                map[key] = unwrap(value.opt(key))
            }
            map
        }
        is JSONArray -> (0 until value.length()).map { unwrap(value.opt(it)) }
        else -> value
    }
}

@Suppress("UNCHECKED_CAST")
fun Any?.obj(): Map<String, Any?>? = this as? Map<String, Any?>

fun Any?.arr(): List<Any?>? = this as? List<Any?>

fun Any?.str(): String? = this as? String

fun Any?.bool(): Boolean? = this as? Boolean

fun Any?.num(): Number? = this as? Number

/** Whole numbers only, like Swift's `as? Int` on a JSON number. */
fun Any?.int(): Int? = when (this) {
    is Int -> this
    is Long -> if (this in Int.MIN_VALUE..Int.MAX_VALUE) this.toInt() else null
    is Number -> this.toDouble().let { if (it == Math.floor(it) && !it.isInfinite()) it.toInt() else null }
    else -> null
}

fun Any?.long(): Long? = when (this) {
    is Long -> this
    is Int -> this.toLong()
    is Number -> this.toDouble().let { if (it == Math.floor(it) && !it.isInfinite()) it.toLong() else null }
    else -> null
}

fun Any?.double(): Double? = (this as? Number)?.toDouble()

/** Only strings of a list, like Swift's `as? [String]` (which fails on mixed lists). */
fun Any?.strings(): List<String>? {
    val list = this as? List<*> ?: return null
    if (list.any { it !is String }) return null
    @Suppress("UNCHECKED_CAST")
    return list as List<String>
}

fun Any?.objects(): List<Map<String, Any?>>? {
    val list = this as? List<*> ?: return null
    if (list.any { it !is Map<*, *> }) return null
    @Suppress("UNCHECKED_CAST")
    return list as List<Map<String, Any?>>
}

/** The objects of a list, skipping anything else (Swift's `compactMap { $0 as? [String: Any] }`). */
fun Any?.objectsLenient(): List<Map<String, Any?>> =
    (this as? List<*>)?.mapNotNull { it.obj() } ?: emptyList()

fun String?.nonEmpty(): String? = if (this.isNullOrEmpty()) null else this

fun String?.nonBlank(): String? = this?.trim()?.ifEmpty { null }

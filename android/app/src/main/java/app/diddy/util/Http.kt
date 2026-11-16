package app.diddy.util

import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** A finished HTTP request: status and body. */
class HttpAnswer(val status: Int, val body: ByteArray, val contentType: String?) {
    val text: String get() = String(body)
    val json: Map<String, Any?>? get() = Json.obj(text)
}

/** One shared HTTP client for the few requests the Matrix SDK does not make. */
object Http {
    val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .followRedirects(true)
        .build()

    private val jsonType = "application/json".toMediaType()

    suspend fun request(
        url: String,
        method: String = "GET",
        json: Any? = null,
        body: ByteArray? = null,
        contentType: String? = null,
        headers: Map<String, String> = emptyMap(),
        client: OkHttpClient = this.client,
    ): HttpAnswer {
        val builder = Request.Builder().url(url)
        headers.forEach { (k, v) -> builder.header(k, v) }
        val requestBody = when {
            json != null -> Json.encode(json).toRequestBody(jsonType)
            body != null -> body.toRequestBody(contentType?.toMediaType())
            method == "POST" || method == "PUT" -> ByteArray(0).toRequestBody(null)
            else -> null
        }
        builder.method(method, requestBody)
        return client.newCall(builder.build()).await()
    }

    suspend fun Call.await(): HttpAnswer = suspendCancellableCoroutine { continuation ->
        continuation.invokeOnCancellation { cancel() }
        enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                if (continuation.isActive) continuation.resumeWithException(e)
            }

            override fun onResponse(call: Call, response: Response) {
                response.use {
                    val bytes = try {
                        it.body?.bytes() ?: ByteArray(0)
                    } catch (e: IOException) {
                        if (continuation.isActive) continuation.resumeWithException(e)
                        return
                    }
                    if (continuation.isActive) continuation.resume(HttpAnswer(it.code, bytes, it.header("Content-Type")))
                }
            }
        })
    }
}

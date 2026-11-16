package app.diddy.ui.call

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckBox
import androidx.compose.material.icons.filled.CheckBoxOutlineBlank
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.StopCircle
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.diddy.call.MyInstantsClient
import app.diddy.call.MyInstantsParser
import app.diddy.call.Soundboard
import app.diddy.ui.FullSheet
import app.diddy.ui.sheets.SearchBar
import app.diddy.ui.theme.Theme
import app.diddy.util.DiddyError
import app.diddy.util.friendlyMessage
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/** Search myinstants.com, listen, and import sounds into the soundboard (ios MyInstantsView). */
@Composable
fun MyInstantsSheet(onClose: () -> Unit) {
    val scope = rememberCoroutineScope()
    var input by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<MyInstantsParser.Item>>(emptyList()) }
    var selected by remember { mutableStateOf<Set<String>>(emptySet()) }
    var searching by remember { mutableStateOf(false) }
    var importing by remember { mutableStateOf(false) }
    var loadingPreview by remember { mutableStateOf<String?>(null) }
    var status by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var term by remember { mutableStateOf<String?>(null) }
    var nextPage by remember { mutableStateOf(1) }
    var canLoadMore by remember { mutableStateOf(false) }
    val audio = remember { mutableMapOf<String, Pair<ByteArray, String>>() }
    var previewJob by remember { mutableStateOf<Job?>(null) }
    DisposableEffect(Unit) { onDispose { Soundboard.stopPreview() } }

    suspend fun data(item: MyInstantsParser.Item): Pair<ByteArray, String> {
        audio[item.path]?.let { return it }
        val url = MyInstantsParser.soundUrl(item.path) ?: throw DiddyError("Invalid sound link.")
        val got = MyInstantsClient.audio(url)
        if (audio.size >= 5) audio.clear()
        audio[item.path] = got
        return got
    }
    fun search(more: Boolean) {
        error = null
        status = null
        val target = if (more) term?.let { MyInstantsParser.Target.Search(it, nextPage) } else MyInstantsParser.parseInput(input)
        if (target == null) { error = "Enter a search term or a myinstants.com link."; return }
        searching = true
        if (!more) { selected = emptySet(); audio.clear() }
        scope.launch {
            try {
                when (target) {
                    is MyInstantsParser.Target.Search -> {
                        val page = MyInstantsParser.parseSearch(MyInstantsClient.text(MyInstantsParser.searchUrl(target.name, target.page)))
                        val known = if (more) results.map { it.path }.toSet() else emptySet()
                        val fresh = page.items.filter { it.path !in known }
                        results = if (more) results + fresh else page.items
                        term = target.name
                        nextPage = target.page + 1
                        canLoadMore = page.hasNext && fresh.isNotEmpty()
                        if (results.isEmpty()) status = "No sounds found."
                    }
                    is MyInstantsParser.Target.Instant -> {
                        val item = MyInstantsParser.parseInstantPage(MyInstantsClient.text(target.url), target.url)
                        term = null
                        canLoadMore = false
                        results = listOfNotNull(item)
                        if (item == null) status = "No sound found on that page."
                    }
                }
            } catch (e: Exception) {
                if (!more) results = emptyList()
                canLoadMore = false
                error = e.friendlyMessage
            }
            searching = false
        }
    }
    FullSheet(
        "MyInstants", onClose, closeLabel = "Done",
        action = if (importing) "…" else "Import", actionEnabled = selected.isNotEmpty() && !importing,
        onAction = {
            importing = true
            scope.launch {
                var added = 0; var existing = 0; var failed = 0
                for (item in results.filter { it.path in selected }) {
                    try {
                        val (bytes, ext) = data(item)
                        if (Soundboard.add(bytes, item.name, ext)) added++ else existing++
                    } catch (_: Exception) {
                        failed++
                    }
                }
                importing = false
                selected = emptySet()
                status = listOfNotNull(
                    "$added added".takeIf { added > 0 },
                    "$existing already there".takeIf { existing > 0 },
                    "$failed failed (too long or not audio)".takeIf { failed > 0 },
                ).joinToString(", ").ifEmpty { null }
            }
        },
    ) {
        Column(Modifier.fillMaxSize()) {
            SearchBar(input, { input = it }, "Search or paste a myinstants.com link", onGo = { search(false) })
            Row(Modifier.padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = { search(false) }, enabled = !searching && input.isNotBlank()) { Text("Search") }
                if (results.isNotEmpty()) TextButton(onClick = { selected = if (selected.size == results.size) emptySet() else results.map { it.path }.toSet() }) {
                    Text(if (selected.size == results.size) "Select None" else "Select All")
                }
                if (searching || importing) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = Theme.accent)
            }
            status?.let { Text(it, color = Theme.muted, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 16.dp)) }
            error?.let { Text(it, color = Theme.danger, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 16.dp)) }
            LazyColumn(Modifier.weight(1f)) {
                items(results, key = { it.path }) { item ->
                    val on = item.path in selected
                    Row(
                        Modifier.fillMaxWidth().clickable { selected = if (on) selected - item.path else selected + item.path }.padding(horizontal = 16.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(if (on) Icons.Filled.CheckBox else Icons.Filled.CheckBoxOutlineBlank, null, tint = if (on) Theme.accent else Theme.faint)
                        Spacer(Modifier.width(12.dp))
                        Text(item.name, color = Theme.text, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                        val playingThis = Soundboard.previewing == item.path
                        Box(Modifier.size(40.dp).clickable {
                            previewJob?.cancel()
                            if (playingThis || loadingPreview == item.path) { Soundboard.stopPreview(); loadingPreview = null; return@clickable }
                            loadingPreview = item.path
                            previewJob = scope.launch {
                                try {
                                    val (bytes, _) = data(item)
                                    if (loadingPreview == item.path) Soundboard.preview(bytes, item.path)
                                } catch (e: Exception) {
                                    error = e.friendlyMessage
                                }
                                loadingPreview = null
                            }
                        }, contentAlignment = Alignment.Center) {
                            if (loadingPreview == item.path) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = Theme.accent)
                            else Icon(if (playingThis) Icons.Filled.StopCircle else Icons.Filled.PlayCircle, "Listen", tint = Theme.accent)
                        }
                    }
                }
                if (canLoadMore) item { TextButton(onClick = { search(true) }, enabled = !searching, modifier = Modifier.padding(8.dp)) { Text("Load more") } }
            }
            Text("Sounds from myinstants.com. Clips can be at most 20 seconds long.", color = Theme.faint, fontSize = 12.sp, modifier = Modifier.padding(16.dp))
        }
    }
}

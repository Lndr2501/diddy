package app.diddy.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.diddy.matrix.EmojiCatalog
import app.diddy.matrix.EmojiEntry
import app.diddy.matrix.ImagePack
import app.diddy.matrix.MatrixAccount
import app.diddy.matrix.PackImage
import app.diddy.ui.InputField
import app.diddy.ui.MxcPicture
import app.diddy.ui.theme.Theme
import app.diddy.util.Json

private const val RECENT_EMOJI = "io.element.recent_emoji"

/** Remembers an emoji as used (desktop `addRecentEmoji`, account data shared with Element). */
suspend fun MatrixAccount.addRecentEmoji(unicode: String) {
    try {
        val current = client.accountData(RECENT_EMOJI)?.let { Json.obj(it) }
        client.setAccountData(RECENT_EMOJI, Json.encode(EmojiCatalog.addingRecent(unicode, current)))
    } catch (_: Exception) {}
}

/**
 * The emoji picker of the composer and of reactions: search, recently used, the groups and the
 * custom emoji and sticker packs (ios ComposerEmojiPicker / EmojiReactionPicker).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EmojiPickerSheet(
    account: MatrixAccount,
    packs: List<ImagePack>,
    onDismiss: () -> Unit,
    onEmoji: (String) -> Unit,
    onCustom: ((PackImage, Boolean) -> Unit)? = null,
) {
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var query by remember { mutableStateOf("") }
    var tab by remember { mutableStateOf(0) }
    var recent by remember { mutableStateOf<List<EmojiEntry>>(emptyList()) }
    LaunchedEffect(Unit) {
        recent = try { EmojiCatalog.recent(account.client.accountData(RECENT_EMOJI)?.let { Json.obj(it) }, 24) } catch (_: Exception) { emptyList() }
    }
    val emoticons = packs.flatMap { it.images(ImagePack.EMOTICON) }
    val stickers = packs.flatMap { it.images(ImagePack.STICKER) }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheet, containerColor = Theme.sidebar) {
        Column(Modifier.fillMaxWidth().fillMaxHeight(0.85f)) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp).clip(RoundedCornerShape(10.dp)).background(Theme.elevated).padding(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.Search, null, tint = Theme.faint, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                InputField(query, { query = it }, "Search emoji")
            }
            if (onCustom != null && (emoticons.isNotEmpty() || stickers.isNotEmpty())) {
                Row(Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                    listOf("Emoji", "Custom", "Stickers").forEachIndexed { index, label ->
                        if (index == 1 && emoticons.isEmpty() || index == 2 && stickers.isEmpty()) return@forEachIndexed
                        Text(
                            label, color = if (tab == index) Theme.onAccent else Theme.text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(end = 6.dp).clip(CircleShape).background(if (tab == index) Theme.accent else Theme.elevated)
                                .clickable { tab = index }.padding(horizontal = 14.dp, vertical = 6.dp),
                        )
                    }
                }
            }
            when (tab) {
                0 -> {
                    val results = if (query.isBlank()) null else EmojiCatalog.search(query.trim(), 120)
                    LazyVerticalGrid(GridCells.Adaptive(44.dp), Modifier.fillMaxWidth().padding(horizontal = 8.dp)) {
                        if (results != null) {
                            items(results, key = { "s" + it.unicode }) { EmojiCell(it.unicode) { onEmoji(it.unicode) } }
                        } else {
                            if (recent.isNotEmpty()) {
                                item(span = { GridItemSpan(maxLineSpan) }) { GroupTitle("Recently Used") }
                                items(recent, key = { "r" + it.unicode }) { EmojiCell(it.unicode) { onEmoji(it.unicode) } }
                            }
                            EmojiCatalog.groups.forEachIndexed { index, group ->
                                if (group.isEmpty()) return@forEachIndexed
                                item(span = { GridItemSpan(maxLineSpan) }) { GroupTitle(EmojiCatalog.groupNames[index]) }
                                items(group, key = { "g$index" + it.unicode }) { EmojiCell(it.unicode) { onEmoji(it.unicode) } }
                            }
                        }
                    }
                }
                1 -> PackGrid(account, emoticons.filter { query.isBlank() || ImagePack.matches(it, query) }, 44) { onCustom?.invoke(it, false) }
                2 -> PackGrid(account, stickers.filter { query.isBlank() || ImagePack.matches(it, query) }, 88) { onCustom?.invoke(it, true) }
            }
        }
    }
}

@Composable
private fun GroupTitle(title: String) {
    Text(title.uppercase(), color = Theme.faint, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 6.dp, top = 12.dp, bottom = 4.dp))
}

@Composable
private fun EmojiCell(unicode: String, onClick: () -> Unit) {
    Box(Modifier.size(44.dp).clip(RoundedCornerShape(8.dp)).clickable(onClick = onClick), contentAlignment = Alignment.Center) {
        Text(unicode, fontSize = 26.sp)
    }
}

@Composable
private fun PackGrid(account: MatrixAccount, images: List<PackImage>, size: Int, onPick: (PackImage) -> Unit) {
    LazyVerticalGrid(GridCells.Adaptive(size.dp), Modifier.fillMaxWidth().padding(horizontal = 8.dp)) {
        items(images, key = { it.id }) { image ->
            Box(Modifier.size(size.dp).clip(RoundedCornerShape(8.dp)).clickable { onPick(image) }.padding(4.dp), contentAlignment = Alignment.Center) {
                MxcPicture(account, null, url = image.url, size = size * 3, modifier = Modifier.size((size - 8).dp), contentScale = ContentScale.Fit, placeholder = {})
            }
        }
    }
}

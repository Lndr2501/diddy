package app.diddy.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.InlineTextContent
import androidx.compose.foundation.text.appendInlineContent
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.LinkInteractionListener
import androidx.compose.ui.text.Placeholder
import androidx.compose.ui.text.PlaceholderVerticalAlign
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import app.diddy.matrix.MarkdownParser
import app.diddy.matrix.MatrixAccount
import app.diddy.matrix.MentionText
import app.diddy.matrix.RichBlock
import app.diddy.matrix.RichDocument
import app.diddy.matrix.RichDocumentCache
import app.diddy.matrix.RichInline
import app.diddy.matrix.RichSource
import app.diddy.matrix.RichStyle
import app.diddy.ui.MxcPicture
import app.diddy.ui.theme.Theme

object ChatStyle {
    val avatarSize = 40.dp
    val avatarSpacing = 12.dp
    val edgePadding = 14.dp
    val bodySize = 16.sp
    val nameSize = 16.sp
    val timeSize = 12.sp
    val textLeading = edgePadding + avatarSize + avatarSpacing
}

/** Schemes a tap may open. Anything else in someone's message stays plain text. */
private val tappableSchemes = setOf("http", "https", "matrix")
private val bareLink = Regex("""https?://[^\s<>()]+[^\s<>().,;:!?'"]""")

/**
 * A message body: the formatted document (HTML or Markdown) or the plain body with Markdown
 * inline formatting, links and mentions (ios RichMessageBody + MessageRowView.rendered).
 */
@Composable
fun MessageText(
    text: String,
    rich: RichSource?,
    italic: Boolean,
    edited: Boolean,
    account: MatrixAccount,
    color: Color = Theme.text,
    fontSize: TextUnit = ChatStyle.bodySize,
    onLink: (String) -> Unit,
) {
    val document = remember(text, rich, italic) {
        val base = if (rich != null) RichDocumentCache.document(rich) else {
            val linked = MentionText.linkingBareIds(text) { account.name(it) }
            val parser = MarkdownParser()
            val inlines = parser.inlines(linked, RichStyle())
            RichDocument(listOf(RichBlock.Paragraph(inlines)), parser.spoilers)
        }
        if (italic) base.italicized() else base
    }
    RichDocumentView(document, edited, account, color, fontSize, onLink)
}

@Composable
fun RichDocumentView(
    document: RichDocument,
    edited: Boolean,
    account: MatrixAccount,
    color: Color = Theme.text,
    fontSize: TextUnit = ChatStyle.bodySize,
    onLink: (String) -> Unit,
) {
    var revealed by remember(document) { mutableStateOf(setOf<Int>()) }
    val context = InlineContext(account, color, fontSize, revealed, { revealed = revealed + it }, onLink)
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        document.blocks.forEachIndexed { index, block ->
            Block(block, context, edited && index == document.blocks.lastIndex)
        }
    }
}

private class InlineContext(
    val account: MatrixAccount,
    val color: Color,
    val fontSize: TextUnit,
    val revealed: Set<Int>,
    val reveal: (Int) -> Unit,
    val onLink: (String) -> Unit,
)

@Composable
private fun Block(block: RichBlock, context: InlineContext, edited: Boolean) {
    when (block) {
        is RichBlock.Paragraph -> InlineText(block.inlines, context, edited)
        is RichBlock.Heading -> {
            val size = when (block.level) { 1 -> 1.5f; 2 -> 1.3f; 3 -> 1.15f; else -> 1f }
            InlineText(block.inlines, context, edited, scale = size, bold = true)
        }
        is RichBlock.Code -> Column(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Theme.rail).padding(10.dp),
        ) {
            block.label?.let { Text(it, color = Theme.faint, fontSize = 11.sp, modifier = Modifier.padding(bottom = 4.dp)) }
            Box(Modifier.horizontalScroll(rememberScrollState())) {
                Text(block.code, color = context.color, fontFamily = FontFamily.Monospace, fontSize = 13.sp)
            }
        }
        is RichBlock.Quote -> Row(Modifier.height(IntrinsicSize.Min)) {
            Box(Modifier.width(3.dp).fillMaxHeight().clip(RoundedCornerShape(2.dp)).background(Theme.faint))
            Column(Modifier.padding(start = 10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                block.blocks.forEachIndexed { i, inner -> Block(inner, context, edited && i == block.blocks.lastIndex) }
            }
        }
        is RichBlock.ListBlock -> Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            block.items.forEachIndexed { index, item ->
                Row {
                    Text(
                        if (block.ordered) "${block.start + index}." else "•",
                        color = context.color, fontSize = context.fontSize,
                        modifier = Modifier.width(if (block.ordered) 26.dp else 16.dp),
                    )
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        item.forEachIndexed { i, inner -> Block(inner, context, edited && index == block.items.lastIndex && i == item.lastIndex) }
                    }
                }
            }
        }
        RichBlock.Rule -> Box(Modifier.fillMaxWidth().padding(vertical = 4.dp).height(1.dp).background(Theme.faint.copy(alpha = 0.4f)))
    }
}

@Composable
private fun InlineText(inlines: List<RichInline>, context: InlineContext, edited: Boolean, scale: Float = 1f, bold: Boolean = false) {
    val emojiContent = mutableMapOf<String, InlineTextContent>()
    val linkStyle = TextLinkStyles(SpanStyle(color = Theme.accent))
    val annotated = buildAnnotatedString {
        if (bold) pushStyle(SpanStyle(fontWeight = FontWeight.Bold))
        var previousMention: String? = null
        for (item in inlines) {
            when (item) {
                is RichInline.Text -> {
                    val style = item.style
                    val link = style.link
                    val mention = link?.let { MentionText.userId(it) }
                    if (mention != null) {
                        val mine = mention == context.account.userId
                        val text = if (previousMention != mention && !item.text.startsWith("@")) "@" + item.text else item.text
                        withLink(LinkAnnotation.Clickable("mention:$mention", null, LinkInteractionListener { context.onLink(link) })) {
                            withStyle(
                                spanStyle(style, context).copy(
                                    fontWeight = FontWeight.SemiBold,
                                    background = (if (mine) Theme.accent else Theme.accent.copy(alpha = 0.6f)).copy(alpha = 0.25f),
                                )
                            ) { append(text) }
                        }
                        previousMention = mention
                        continue
                    }
                    previousMention = null
                    val spoiler = style.spoiler
                    if (spoiler != null && spoiler !in context.revealed) {
                        withLink(LinkAnnotation.Clickable("spoiler:$spoiler", null, LinkInteractionListener { context.reveal(spoiler) })) {
                            withStyle(SpanStyle(color = Color.Transparent, background = Theme.faint)) { append(item.text) }
                        }
                        continue
                    }
                    if (link != null) {
                        val scheme = link.substringBefore(':').lowercase()
                        if (scheme in tappableSchemes) {
                            withLink(LinkAnnotation.Clickable("link:$link", linkStyle, LinkInteractionListener { context.onLink(link) })) {
                                withStyle(spanStyle(style, context)) { append(item.text) }
                            }
                        } else {
                            withStyle(spanStyle(style, context)) { append(item.text) }
                        }
                        continue
                    }
                    appendWithBareLinks(item.text, spanStyle(style, context), linkStyle, context)
                }
                is RichInline.Emoji -> {
                    val id = "emoji:${item.url}"
                    emojiContent[id] = InlineTextContent(Placeholder(1.35.em, 1.35.em, PlaceholderVerticalAlign.TextCenter)) {
                        MxcPicture(context.account, null, url = item.url, size = 96, modifier = Modifier.fillMaxWidth().fillMaxHeight(),
                            contentScale = androidx.compose.ui.layout.ContentScale.Fit, placeholder = {})
                    }
                    appendInlineContent(id, item.alt)
                }
            }
        }
        if (edited) withStyle(SpanStyle(color = Theme.faint, fontSize = 11.sp)) { append(" (edited)") }
        if (bold) pop()
    }
    Text(
        annotated,
        color = context.color,
        fontSize = context.fontSize * scale,
        inlineContent = emojiContent,
    )
}

private fun spanStyle(style: RichStyle, context: InlineContext): SpanStyle {
    val decorations = listOfNotNull(
        if (style.underline) TextDecoration.Underline else null,
        if (style.strike) TextDecoration.LineThrough else null,
    )
    return SpanStyle(
        fontWeight = if (style.bold) FontWeight.Bold else null,
        fontStyle = if (style.italic) FontStyle.Italic else null,
        textDecoration = if (decorations.isEmpty()) null else TextDecoration.combine(decorations),
        fontFamily = if (style.code) FontFamily.Monospace else null,
        background = if (style.code) Theme.rail else Color.Unspecified,
    )
}

/** Plain text with tappable bare links, which formatting alone leaves as plain text. */
private fun AnnotatedString.Builder.appendWithBareLinks(text: String, style: SpanStyle, linkStyle: TextLinkStyles, context: InlineContext) {
    var last = 0
    for (match in bareLink.findAll(text)) {
        if (match.range.first > last) withStyle(style) { append(text.substring(last, match.range.first)) }
        val url = match.value
        withLink(LinkAnnotation.Clickable("link:$url", linkStyle, LinkInteractionListener { context.onLink(url) })) {
            withStyle(style) { append(url) }
        }
        last = match.range.last + 1
    }
    if (last < text.length) withStyle(style) { append(text.substring(last)) }
}

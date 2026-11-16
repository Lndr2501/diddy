package app.diddy.matrix

import java.text.Normalizer

/** The quick switcher of desktop (Ctrl+K): `#` rooms, `@` people, `*` servers (ios QuickSwitchLogic). */
object QuickSwitch {
    enum class Kind { ROOMS, DIRECTS, SPACES }

    data class Item(val id: String, val name: String, val dmUsername: String?, val kind: Kind)

    fun parse(input: String): Pair<Kind?, String> {
        val value = input.trim()
        val first = value.firstOrNull() ?: return null to ""
        val asked = when (first) {
            '#' -> Kind.ROOMS
            '@' -> Kind.DIRECTS
            '*' -> Kind.SPACES
            else -> null
        } ?: return null to value
        return asked to value.drop(1)
    }

    fun targets(kind: Kind?, rooms: List<Item>, directs: List<Item>, spaces: List<Item>): List<Item> = when (kind) {
        null -> rooms + directs + spaces
        Kind.ROOMS -> rooms
        Kind.DIRECTS -> directs
        Kind.SPACES -> spaces
    }

    /** Without a query: the last active first, at most 20; servers in their order. */
    fun recent(kind: Kind?, rooms: List<Item>, directs: List<Item>, spaces: List<Item>, activity: Map<String, Int>): List<Item> {
        fun byActivity(items: List<Item>) = items.withIndex()
            .sortedWith(compareBy<IndexedValue<Item>>({ activity[it.value.id] ?: Int.MAX_VALUE }, { it.index }))
            .map { it.value }.take(20)
        return when (kind) {
            Kind.SPACES -> spaces
            Kind.DIRECTS -> byActivity(directs)
            Kind.ROOMS -> byActivity(rooms)
            null -> byActivity(rooms + directs)
        }
    }

    fun normalize(text: String): String = Normalizer.normalize(text, Normalizer.Form.NFKC).lowercase()

    private fun strings(item: Item): List<String> =
        if (item.kind == Kind.DIRECTS && !item.dmUsername.isNullOrEmpty()) listOf(item.name, item.dmUsername) else listOf(item.name)

    fun matchedString(item: Item, query: String): String? {
        if (query.isEmpty()) return null
        return strings(item).map(::normalize).firstOrNull { it.contains(query) }
    }

    private data class Scored(val item: Item, val length: Int, val index: Int, val boundary: Boolean, val perfectBoundary: Boolean)

    /** Items containing the query, best first like the desktop's orderSearchItems. */
    fun search(input: String, items: List<Item>): List<Item> {
        val query = normalize(input)
        if (query.isEmpty()) return emptyList()
        val escaped = Regex.escape(query)
        val boundary = Regex("(\\b|_)$escaped")
        val perfect = Regex("(\\b|_)$escaped(\\b|_)")
        val scored = items.mapNotNull { item ->
            val text = matchedString(item, query) ?: return@mapNotNull null
            Scored(item, text.length, text.indexOf(query), boundary.containsMatchIn(text), perfect.containsMatchIn(text))
        }
        // A stable insertion sort with the desktop's pairwise points.
        val sorted = mutableListOf<Scored>()
        for (entry in scored) {
            var position = sorted.size
            while (position > 0 && compare(entry, sorted[position - 1]) < 0) position--
            sorted.add(position, entry)
        }
        return sorted.map { it.item }
    }

    private fun compare(a: Scored, b: Scored): Int {
        var points1 = 0
        var points2 = 0
        fun toShorter(points: Int) {
            if (a.length < b.length) points1 += points else if (b.length < a.length) points2 += points
        }
        toShorter(1)
        if (a.index < b.index) points1 += 2 else if (b.index < a.index) points2 += 2 else toShorter(2)
        if (a.boundary && b.boundary) toShorter(4) else if (a.boundary) points1 += 4 else if (b.boundary) points2 += 4
        if (a.perfectBoundary && b.perfectBoundary) toShorter(8) else if (a.perfectBoundary) points1 += 8 else if (b.perfectBoundary) points2 += 8
        return points2 - points1
    }
}

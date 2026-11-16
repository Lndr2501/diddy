package app.diddy.matrix

import org.matrix.rustcomponents.sdk.Room
import org.matrix.rustcomponents.sdk.RoomListEntriesUpdate
import org.matrix.rustcomponents.sdk.TimelineDiff
import org.matrix.rustcomponents.sdk.TimelineItem

/** Applies an SDK list diff to a plain list (same shape for rooms and timeline items). */
sealed class ListDiff<T> {
    class Append<T>(val values: List<T>) : ListDiff<T>()
    class Clear<T> : ListDiff<T>()
    class PushFront<T>(val value: T) : ListDiff<T>()
    class PushBack<T>(val value: T) : ListDiff<T>()
    class PopFront<T> : ListDiff<T>()
    class PopBack<T> : ListDiff<T>()
    class Insert<T>(val index: Int, val value: T) : ListDiff<T>()
    class Set<T>(val index: Int, val value: T) : ListDiff<T>()
    class Remove<T>(val index: Int) : ListDiff<T>()
    class Truncate<T>(val length: Int) : ListDiff<T>()
    class Reset<T>(val values: List<T>) : ListDiff<T>()

    fun apply(list: MutableList<T>) {
        when (this) {
            is Append -> list.addAll(values)
            is Clear -> list.clear()
            is PushFront -> list.add(0, value)
            is PushBack -> list.add(value)
            is PopFront -> if (list.isNotEmpty()) list.removeAt(0)
            is PopBack -> if (list.isNotEmpty()) list.removeAt(list.size - 1)
            is Insert -> list.add(minOf(index, list.size), value)
            is Set -> if (index < list.size) list[index] = value
            is Remove -> if (index < list.size) list.removeAt(index)
            is Truncate -> while (list.size > length) list.removeAt(list.size - 1)
            is Reset -> {
                list.clear()
                list.addAll(values)
            }
        }
    }

    companion object {
        fun of(update: RoomListEntriesUpdate): ListDiff<Room> = when (update) {
            is RoomListEntriesUpdate.Append -> Append(update.values)
            is RoomListEntriesUpdate.Clear -> Clear()
            is RoomListEntriesUpdate.PushFront -> PushFront(update.value)
            is RoomListEntriesUpdate.PushBack -> PushBack(update.value)
            is RoomListEntriesUpdate.PopFront -> PopFront()
            is RoomListEntriesUpdate.PopBack -> PopBack()
            is RoomListEntriesUpdate.Insert -> Insert(update.index.toInt(), update.value)
            is RoomListEntriesUpdate.Set -> Set(update.index.toInt(), update.value)
            is RoomListEntriesUpdate.Remove -> Remove(update.index.toInt())
            is RoomListEntriesUpdate.Truncate -> Truncate(update.length.toInt())
            is RoomListEntriesUpdate.Reset -> Reset(update.values)
        }

        fun of(diff: TimelineDiff): ListDiff<TimelineItem> = when (diff) {
            is TimelineDiff.Append -> Append(diff.values)
            is TimelineDiff.Clear -> Clear()
            is TimelineDiff.PushFront -> PushFront(diff.value)
            is TimelineDiff.PushBack -> PushBack(diff.value)
            is TimelineDiff.PopFront -> PopFront()
            is TimelineDiff.PopBack -> PopBack()
            is TimelineDiff.Insert -> Insert(diff.index.toInt(), diff.value)
            is TimelineDiff.Set -> Set(diff.index.toInt(), diff.value)
            is TimelineDiff.Remove -> Remove(diff.index.toInt())
            is TimelineDiff.Truncate -> Truncate(diff.length.toInt())
            is TimelineDiff.Reset -> Reset(diff.values)
        }
    }
}

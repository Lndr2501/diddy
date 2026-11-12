import Foundation

// The geometry of the call stage (CallStageView.swift), Foundation only so it is checked on any
// machine: Tools/stagelayout_check.

/// How `count` equal tiles fill `size`: the column count that gives the biggest 16:10 tile.
/// Layouts whose rows fit the height without scrolling win over ones that need to scroll, so a
/// short landscape stage gets 3 + 2 tiles instead of five full-width rows.
struct StageGridLayout: Equatable {
    let columns: Int
    let cellWidth: CGFloat
    let cellHeight: CGFloat
    let rows: Int

    static func make(count: Int, size: CGSize, spacing: CGFloat, minCellHeight: CGFloat) -> StageGridLayout {
        let count = max(count, 1)
        let width = max(size.width, 1)
        let height = max(size.height, 1)
        var best: StageGridLayout?
        var bestFits = false
        var bestArea: CGFloat = -1
        for columns in 1...count {
            let rows = (count + columns - 1) / columns
            let cellWidth = max((width - CGFloat(columns - 1) * spacing) / CGFloat(columns), 1)
            let rawHeight = max((height - CGFloat(rows - 1) * spacing) / CGFloat(rows), 1)
            let fits = rawHeight >= minCellHeight
            let fitWidth = min(cellWidth, rawHeight * 1.6)
            let area = fitWidth * fitWidth / 1.6
            // a layout without scrolling always beats one with; otherwise the bigger tile wins
            let better = best == nil || (fits && !bestFits) || (fits == bestFits && area > bestArea + 0.5)
            if better {
                best = StageGridLayout(columns: columns, cellWidth: cellWidth, cellHeight: max(rawHeight, minCellHeight), rows: rows)
                bestFits = fits
                bestArea = area
            }
        }
        return best!
    }
}

/// One large tile and the others as thumbnails: under it, or beside it (a column on the right)
/// when that leaves a 16:9 picture more room, as on an iPhone in landscape. Thumbnails shrink
/// before they scroll.
struct StageStripLayout: Equatable {
    /// The thumbnails stand in a column beside the large tile.
    let beside: Bool
    let focus: CGSize
    let thumb: CGSize
    /// The scrolling area of the thumbnails (zero without thumbnails).
    let strip: CGSize

    static func make(count: Int, size: CGSize, spacing: CGFloat) -> StageStripLayout {
        let width = max(size.width, 1)
        let height = max(size.height, 1)
        guard count > 0 else {
            return StageStripLayout(beside: false, focus: CGSize(width: width, height: height), thumb: .zero, strip: .zero)
        }
        let under = below(count: count, width: width, height: height, spacing: spacing)
        let side = beside(count: count, width: width, height: height, spacing: spacing)
        return side.pictureWidth > under.pictureWidth + 0.5 ? side : under
    }

    /// The width of a 16:9 picture fitted into the large tile.
    var pictureWidth: CGFloat { min(focus.width, focus.height * 16 / 9) }

    private static func below(count: Int, width: CGFloat, height: CGFloat, spacing: CGFloat) -> StageStripLayout {
        let n = CGFloat(count)
        let thumbHeight: CGFloat = height < 380 ? 72 : 104
        let perThumb = (width - (n - 1) * spacing) / n
        let thumbWidth = max(min(thumbHeight * 1.6, perThumb), thumbHeight * 1.2)
        return StageStripLayout(
            beside: false,
            focus: CGSize(width: width, height: max(height - thumbHeight - spacing, 60)),
            thumb: CGSize(width: thumbWidth, height: thumbHeight),
            strip: CGSize(width: width, height: thumbHeight)
        )
    }

    private static func beside(count: Int, width: CGFloat, height: CGFloat, spacing: CGFloat) -> StageStripLayout {
        let n = CGFloat(count)
        let stripWidth = min(max(width * 0.2, 120), 180)
        let perThumb = (height - (n - 1) * spacing) / n
        let thumbHeight = max(min(stripWidth / 1.6, perThumb), 56)
        return StageStripLayout(
            beside: true,
            focus: CGSize(width: max(width - stripWidth - spacing, 60), height: height),
            thumb: CGSize(width: stripWidth, height: thumbHeight),
            strip: CGSize(width: stripWidth, height: height)
        )
    }
}

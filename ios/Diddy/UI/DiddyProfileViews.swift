import SwiftUI

/// The banner at the top of a profile card: the image, else the colours the person chose, else
/// their stable default colour.
struct DiddyBanner: View {
    let profile: DiddyProfile?
    let seed: String
    let account: MatrixAccount
    @State private var image: UIImage?

    var body: some View {
        ZStack {
            background
            if let image {
                if let pos = profile?.bannerPos {
                    // the part of the banner the owner chose (focal point and zoom)
                    GeometryReader { proxy in
                        let place = pos.placement(imageWidth: image.size.width, imageHeight: image.size.height,
                                                  boxWidth: proxy.size.width, boxHeight: proxy.size.height)
                        Image(uiImage: image).resizable()
                            .frame(width: place.width, height: place.height)
                            .position(x: place.x + place.width / 2, y: place.y + place.height / 2)
                    }
                } else {
                    Image(uiImage: image).resizable().scaledToFill()
                }
            }
        }
        .frame(maxWidth: .infinity)
        .clipped()
        .task(id: profile?.bannerMxc) {
            guard let mxc = profile?.bannerMxc else { image = nil; return }
            image = await MediaLoader.shared.thumbnail(url: mxc, size: 800, accountId: account.id, client: account.client)
        }
    }

    @ViewBuilder
    private var background: some View {
        let from = Color(diddyHex: profile?.cardFrom)
        let to = Color(diddyHex: profile?.cardTo)
        if let from, let to {
            let points = UnitPoint.cssGradient(angle: profile?.cardAngle ?? 135)
            LinearGradient(colors: [from, to], startPoint: points.start, endPoint: points.end)
        } else {
            from ?? to ?? Theme.color(for: seed).opacity(0.7)
        }
    }
}

/// A small dot for the status someone picked in Diddy (nothing for "invisible").
struct DiddyStatusDot: View {
    let status: DiddyProfile.Status?
    var size: CGFloat = 12
    var ring: Color = Theme.sidebar

    var body: some View {
        if let color = status?.color {
            Circle().fill(color)
                .frame(width: size, height: size)
                .overlay(Circle().stroke(ring, lineWidth: size / 4))
                .accessibilityLabel(status?.title ?? "")
        }
    }
}

/// The parts of a Diddy card below the name, in the order and selection the owner chose.
struct DiddyCardModules: View {
    let profile: DiddyProfile

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(profile.modules, id: \.self) { module in
                switch module {
                case "bio": if let bio = profile.bio { section("About Me") { Text(bio).foregroundStyle(Theme.text) } }
                case "activity": if let activity = profile.activity { section(Self.activityTitle(activity.kind)) { activityView(activity) } }
                case "about": if !profile.about.isEmpty { section("Info") { facts } }
                case "interests": if !profile.interests.isEmpty { section("Interests") { interests } }
                case "links": if !profile.links.isEmpty { section("Links") { links } }
                default: EmptyView()
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 10).fill(Theme.elevated))
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title.uppercased()).font(.caption.weight(.bold)).foregroundStyle(Theme.faint)
            content()
        }
    }

    private func activityView(_ activity: DiddyProfile.Activity) -> some View {
        HStack(spacing: 10) {
            Image(systemName: Self.activityIcon(activity.kind))
                .foregroundStyle(Theme.accent)
                .frame(width: 32, height: 32)
                .background(RoundedRectangle(cornerRadius: 8).fill(Theme.input))
            VStack(alignment: .leading, spacing: 1) {
                Text(activity.text).foregroundStyle(Theme.text)
                if let detail = activity.detail { Text(detail).font(.caption).foregroundStyle(Theme.muted) }
            }
        }
    }

    private var facts: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(profile.about, id: \.field) { fact in
                Label {
                    Text(fact.value).foregroundStyle(Theme.text)
                } icon: {
                    Image(systemName: Self.factIcon(fact.field)).foregroundStyle(Theme.muted)
                }
                .accessibilityLabel("\(fact.field.capitalized): \(fact.value)")
            }
        }
    }

    private var interests: some View {
        FlowLayout(spacing: 6) {
            ForEach(profile.interests, id: \.self) { interest in
                Text(interest)
                    .font(.footnote)
                    .foregroundStyle(Theme.text)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(Theme.input))
            }
        }
    }

    private var links: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(profile.links, id: \.url) { link in
                Link(destination: link.url) {
                    Label(link.url.host ?? link.url.absoluteString, systemImage: link.kind == "web" ? "globe" : "link")
                        .lineLimit(1)
                }
            }
        }
    }

    static func activityTitle(_ kind: String) -> String {
        switch kind {
        case "music": return "Listening to"
        case "game": return "Playing"
        case "working": return "Working on"
        case "learning": return "Learning"
        default: return "Doing"
        }
    }

    static func activityIcon(_ kind: String) -> String {
        switch kind {
        case "music": return "music.note"
        case "game": return "gamecontroller.fill"
        case "working": return "hammer.fill"
        case "learning": return "book.fill"
        default: return "sparkles"
        }
    }

    private static func factIcon(_ field: String) -> String {
        switch field {
        case "pronouns": return "person.fill"
        case "location": return "mappin.and.ellipse"
        case "age": return "birthday.cake.fill"
        case "education": return "graduationcap.fill"
        default: return "briefcase.fill"
        }
    }
}

/// Lays children out in rows, wrapping like words in a paragraph.
struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(width: proposal.width ?? .infinity, subviews: subviews)
        let width = rows.map { $0.width }.max() ?? 0
        let height = rows.reduce(0) { $0 + $1.height } + spacing * CGFloat(max(rows.count - 1, 0))
        return CGSize(width: proposal.width ?? width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in arrange(width: bounds.width, subviews: subviews) {
            var x = bounds.minX
            for index in row.indices {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
                x += size.width + spacing
            }
            y += row.height + spacing
        }
    }

    private func arrange(width: CGFloat, subviews: Subviews) -> [(indices: [Int], width: CGFloat, height: CGFloat)] {
        var rows: [(indices: [Int], width: CGFloat, height: CGFloat)] = []
        var current: (indices: [Int], width: CGFloat, height: CGFloat) = ([], 0, 0)
        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            let needed = current.indices.isEmpty ? size.width : current.width + spacing + size.width
            if needed > width, !current.indices.isEmpty {
                rows.append(current)
                current = ([index], size.width, size.height)
            } else {
                current = (current.indices + [index], needed, max(current.height, size.height))
            }
        }
        if !current.indices.isEmpty { rows.append(current) }
        return rows
    }
}

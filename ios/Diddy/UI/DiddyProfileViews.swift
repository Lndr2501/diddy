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
            if let image { Image(uiImage: image).resizable().scaledToFill() }
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
            LinearGradient(colors: [from, to], startPoint: .topLeading, endPoint: .bottomTrailing)
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

/// Your own Diddy card extras: status, name colour, bio, facts and what you are doing. Everything
/// else desktop can set (banner, badges, layout, links, ...) is kept as it is.
struct DiddyProfileEditor: View {
    @ObservedObject var account: MatrixAccount
    @State private var status = "online"
    @State private var useNameColor = false
    @State private var nameColor = Theme.accent
    @State private var bio = ""
    @State private var about: [String: String] = [:]
    @State private var activityKind = "none"
    @State private var activityText = ""
    @State private var activityDetail = ""
    @State private var loaded = false
    @State private var saving = false
    @State private var error: String?
    @State private var saved = false

    private var profile: DiddyProfile? { account.diddyProfiles[account.userId] }

    var body: some View {
        Form {
            if !loaded {
                ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear)
            } else if !account.canEditDiddyProfile {
                Section {
                    Text(account.diddyPrimaryRoom == nil
                         ? "No Diddy Options room was found on your servers. Diddy desktop sets one up under Settings > Diddy; your profile can be edited here afterwards."
                         : "Your Diddy Options room is encrypted and this app cannot read your current profile from it yet. Edit your profile in Diddy desktop.")
                        .foregroundStyle(Theme.muted)
                }
            } else {
                preview
                Section("Status") {
                    Picker("Status", selection: $status) {
                        ForEach(["online", "idle", "dnd", "invisible"], id: \.self) { value in
                            Text(DiddyProfile.Status(rawValue: value)?.title ?? value).tag(value)
                        }
                    }
                }
                Section {
                    Toggle("Name colour", isOn: $useNameColor)
                    if useNameColor { ColorPicker("Colour", selection: $nameColor, supportsOpacity: false) }
                } header: { Text("Name") } footer: {
                    Text("A gradient, font or effect set in Diddy desktop stays until you change the colour here.")
                }
                Section {
                    TextField("A few words about you", text: $bio, axis: .vertical)
                        .lineLimit(2...5)
                        .onChange(of: bio) { if $0.count > 160 { bio = String($0.prefix(160)) } }
                } header: { Text("About Me") } footer: { Text("\(bio.count)/160") }
                Section("Info") {
                    ForEach(DiddyProfile.aboutFields, id: \.self) { field in
                        TextField(field.capitalized, text: Binding(
                            get: { about[field] ?? "" },
                            set: { about[field] = String($0.prefix(field == "age" ? 8 : 40)) }
                        ))
                    }
                }
                Section("Activity") {
                    Picker("Doing", selection: $activityKind) {
                        Text("Nothing").tag("none")
                        ForEach(DiddyProfile.activityKinds, id: \.self) { kind in
                            Text(DiddyCardModules.activityTitle(kind)).tag(kind)
                        }
                    }
                    if activityKind != "none" {
                        TextField("What", text: $activityText).onChange(of: activityText) { if $0.count > 60 { activityText = String($0.prefix(60)) } }
                        TextField("Details (optional)", text: $activityDetail).onChange(of: activityDetail) { if $0.count > 60 { activityDetail = String($0.prefix(60)) } }
                    }
                }
                if let error { Text(error).foregroundStyle(Theme.danger) }
                Button {
                    Task { await save() }
                } label: {
                    HStack {
                        if saving { ProgressView() }
                        Text(saved ? "Saved" : "Save")
                    }
                }
                .disabled(saving)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.sidebar)
        .navigationTitle("Diddy Profile")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await account.loadDiddyProfiles(force: true)
            fill()
            loaded = true
        }
    }

    private var preview: some View {
        Section {
            HStack(spacing: 12) {
                AvatarView(url: account.avatarUrl, name: account.title, size: 44, account: account)
                    .overlay(alignment: .bottomTrailing) { DiddyStatusDot(status: DiddyProfile.Status(rawValue: status), ring: Theme.elevated) }
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        if useNameColor {
                            Text(account.title).font(.headline).foregroundStyle(nameColor)
                        } else {
                            DiddyName(name: account.title, profile: profile, font: .headline)
                        }
                        DiddyBadges(badges: account.diddyBadges[account.userId] ?? [], account: account)
                    }
                    Text(bio.isEmpty ? account.userId : bio).font(.caption).foregroundStyle(Theme.muted).lineLimit(2)
                }
            }
        }
    }

    private func fill() {
        let raw = account.diddyOwnProfileRaw ?? [:]
        status = profile?.status?.rawValue ?? "online"
        let style = raw["nameStyle"] as? [String: Any]
        if let color = Color(diddyHex: DiddyProfile.color(style?["color"])) {
            useNameColor = true
            nameColor = color
        }
        bio = profile?.bio ?? ""
        about = Dictionary(uniqueKeysWithValues: (profile?.about ?? []).map { ($0.field, $0.value) })
        activityKind = profile?.activity?.kind ?? "none"
        activityText = profile?.activity?.text ?? ""
        activityDetail = profile?.activity?.detail ?? ""
    }

    private func save() async {
        saving = true
        error = nil
        defer { saving = false }
        // A nil value removes that field from the profile, so it is stored explicitly.
        var changes: [String: Any?] = [:]
        func set(_ key: String, _ value: Any?) { changes.updateValue(value, forKey: key) }
        set("status", status)
        var style = account.diddyOwnProfileRaw?["nameStyle"] as? [String: Any] ?? [:]
        let oldColor = DiddyProfile.color(style["color"])
        let newColor = useNameColor ? Self.hex(nameColor) : nil
        if newColor != oldColor {
            style["color"] = newColor
            // A gradient wins over a colour on desktop, so picking a colour here replaces it.
            if newColor != nil { style["gradient"] = nil }
            set("nameStyle", style.isEmpty ? nil : style)
        }
        let trimmedBio = bio.trimmingCharacters(in: .whitespacesAndNewlines)
        set("bio", trimmedBio.isEmpty ? nil : trimmedBio)
        var facts: [String: String] = [:]
        for (field, value) in about {
            let trimmed = value.trimmingCharacters(in: .whitespaces)
            if !trimmed.isEmpty { facts[field] = trimmed }
        }
        set("about", facts.isEmpty ? nil : facts)
        let text = activityText.trimmingCharacters(in: .whitespaces)
        if activityKind == "none" || text.isEmpty {
            set("activity", nil)
        } else {
            var activity: [String: Any] = ["kind": activityKind, "text": text]
            let detail = activityDetail.trimmingCharacters(in: .whitespaces)
            if !detail.isEmpty { activity["detail"] = detail }
            set("activity", activity)
        }
        do {
            try await account.updateDiddyProfile(changes)
            saved = true
        } catch {
            self.error = error.friendlyMessage
        }
    }

    private static func hex(_ color: Color) -> String? {
        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
        guard UIColor(color).getRed(&red, green: &green, blue: &blue, alpha: &alpha) else { return nil }
        func byte(_ value: CGFloat) -> Int { Int((min(max(value, 0), 1) * 255).rounded()) }
        return String(format: "#%02x%02x%02x", byte(red), byte(green), byte(blue))
    }
}

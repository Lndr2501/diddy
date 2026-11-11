import PhotosUI
import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// Your own Diddy profile with what desktop's profile editor offers (Settings > Profile): name
/// font, effect, weight, colour or gradient; card colours, accent and banner; bio, facts,
/// interests, links and activity; nameplate (colour, gradient, picture, GIF or video); profile
/// effect and frame; status and shown badges; card layout and modules. The preview on top shows
/// the unsaved draft read back like everyone receives it.
///
/// Saving writes only the parts that changed (`DiddyProfileDraft`) on top of the stored profile,
/// read again right before, so everything else stays, also what only desktop knows.
/// Like desktop: sets up the Diddy Options room when there is none, creates and gives badges (badge
/// library), imports own effects, frames and nameplates (ZIP packs or pictures), exports / imports
/// the profile as a file, resets it to the default and shows your Diddy version on the card.
@MainActor
struct DiddyProfileEditor: View {
    @ObservedObject var account: MatrixAccount
    @State private var draft = DiddyProfileDraft()
    @State private var original = DiddyProfileDraft()
    @State private var tab = Tab.name
    @State private var interestsText = ""
    @State private var loaded = false
    @State private var saving = false
    @State private var saved = false
    @State private var uploading: Upload?
    @State private var error: String?
    @State private var bannerItem: PhotosPickerItem?
    @State private var plateItem: PhotosPickerItem?
    @State private var previewWidth: CGFloat = 0
    @State private var shareVersion = DiddyClientVersion.shares
    @State private var originalShareVersion = DiddyClientVersion.shares
    @State private var notice: Notice?
    @State private var importTarget = ImportTarget.profile
    @State private var importing = false
    @State private var exporting = false
    @State private var exportDocument = DiddyProfileDocument()

    private enum Tab: String, CaseIterable {
        case name = "Name", card = "Card", look = "Look", status = "Status", layout = "Layout"
    }

    private enum Upload { case banner, nameplate, effect, frame }

    private enum ImportTarget { case profile, effect, frame, nameplate }

    private struct Notice {
        let isError: Bool
        let text: String
    }

    private typealias Rules = DiddyProfileRules

    private var dirty: Bool { !draft.changedParts(from: original).isEmpty || shareVersion != originalShareVersion }
    private var canSave: Bool {
        loaded && account.canEditDiddyProfile && dirty && !saving && uploading == nil && draft.problems.isEmpty
    }
    private var ownedIds: Set<String> { Set(account.diddyOwnBadges.map { $0.id }) }
    /// The draft as others receive it: merged with the stored profile, read with every check.
    private var shown: DiddyProfile? {
        DiddyProfile(draft.apply(to: account.diddyOwnProfileRaw ?? [:], since: original))
    }
    private var shownBadges: [DiddyBadge] {
        draft.shownBadgeIds(owned: ownedIds).compactMap { id in account.diddyOwnBadges.first { $0.id == id } }
    }

    var body: some View {
        Form {
            if !loaded {
                ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear)
            } else if !account.canEditDiddyProfile {
                if account.diddyPrimaryRoom == nil {
                    DiddyOptionsSetupView(account: account) { Task { await reload() } }
                } else {
                    Section {
                        Text("This app could not read your current profile from your encrypted Diddy Options room yet (the message keys are missing). Verify this device in Settings, then try again, or edit your profile in Diddy desktop.")
                            .foregroundStyle(Theme.muted)
                    }
                }
            } else {
                previewSection
                Section {
                    Picker("Part", selection: $tab) {
                        ForEach(Tab.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                }
                .listRowBackground(Color.clear)
                switch tab {
                case .name: nameTab
                case .card: cardTab
                case .look: lookTab
                case .status: statusTab
                case .layout: layoutTab
                }
                saveSection
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.sidebar)
        .navigationTitle("Diddy Profile")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") { Task { await save() } }.disabled(!canSave)
            }
            if loaded && account.canEditDiddyProfile {
                ToolbarItem(placement: .navigationBarTrailing) { fileMenu }
            }
        }
        .fileExporter(isPresented: $exporting, document: exportDocument, contentType: .json,
                      defaultFilename: DiddyProfileTransfer.fileName) { result in
            switch result {
            case .success(let url): notice = Notice(isError: false, text: "Saved \(url.lastPathComponent).")
            case .failure(let error):
                if (error as? CocoaError)?.code != .userCancelled {
                    notice = Notice(isError: true, text: "The file could not be saved: \(error.localizedDescription)")
                }
            }
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: importTypes, allowsMultipleSelection: false) { result in
            handleImport(result)
        }
        .task { await load() }
        .onChange(of: bannerItem) { item in
            guard let item else { return }
            bannerItem = nil
            Task { await uploadBanner(item) }
        }
        .onChange(of: plateItem) { item in
            guard let item else { return }
            plateItem = nil
            Task { await uploadNameplate(item) }
        }
        .onChange(of: draft) { _ in saved = false }
    }

    // MARK: Preview

    private var previewSection: some View { preview(shown) }

    private func preview(_ shown: DiddyProfile?) -> some View {
        Section {
            VStack(alignment: .leading, spacing: 14) {
                // The card with its frame around it and the effect over it, like the profile card.
                DiddyProfileFrameBox(frame: shown?.frame, account: account, available: previewWidth > 0 ? previewWidth : 280) {
                    previewCard(shown)
                }
                .frame(maxWidth: .infinity)
                // A row of the member list, with the nameplate behind it.
                HStack(spacing: 10) {
                    AvatarView(url: account.avatarUrl, name: account.title, size: 32, account: account)
                        .overlay(alignment: .bottomTrailing) { DiddyStatusDot(status: shown?.status, size: 10) }
                    DiddyName(name: account.title, profile: shown).lineLimit(1)
                    if !shownBadges.isEmpty { DiddyBadges(badges: shownBadges, account: account) }
                    Spacer(minLength: 0)
                }
                .padding(.vertical, 6)
                .padding(.horizontal, 8)
                .diddyNameplate(shown?.nameplate, account: account, bleed: EdgeInsets())
            }
            .padding(.vertical, 4)
            .frame(maxWidth: .infinity)
            .background {
                GeometryReader { proxy in
                    Color.clear
                        .onAppear { previewWidth = proxy.size.width }
                        .onChange(of: proxy.size.width) { previewWidth = $0 }
                }
            }
        } header: {
            Text("Preview")
        } footer: {
            Text("Your unsaved changes, the way other Diddy users will see them.")
        }
    }

    private func previewCard(_ shown: DiddyProfile?) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            ZStack(alignment: .bottomLeading) {
                VStack(spacing: 0) {
                    DiddyBanner(profile: shown, seed: account.userId, account: account)
                        .frame(height: 90)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    Color.clear.frame(height: 34)
                }
                AvatarView(url: account.avatarUrl, name: account.title, size: 68, account: account)
                    .overlay(Circle().stroke(Theme.sidebar, lineWidth: 4))
                    .overlay(alignment: .bottomTrailing) { DiddyStatusDot(status: shown?.status, size: 18) }
                    .padding(.leading, 12)
            }
            HStack(spacing: 6) {
                DiddyName(name: account.title, profile: shown, font: .title3.bold(), size: 20)
                if !shownBadges.isEmpty { DiddyBadges(badges: shownBadges, size: 16, account: account) }
            }
            if let status = shown?.status, status != .invisible {
                Text(status.title).font(.caption).foregroundStyle(Theme.muted)
            }
            if let shown, shown.hasCardContent, tab == .card || tab == .layout {
                DiddyCardModules(profile: shown)
            } else if let bio = shown?.bio {
                Text(bio).font(.subheadline).foregroundStyle(Theme.text).lineLimit(3)
            }
            let accent = Color(diddyHex: shown?.cardAccent)
            Label("Message", systemImage: "bubble.left.fill")
                .font(.footnote.bold())
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .background(RoundedRectangle(cornerRadius: 10).fill(accent ?? Theme.accent))
                .foregroundStyle(accent == nil ? Theme.onAccent : .white)
        }
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Theme.sidebar))
        .overlay {
            if let effect = shown?.effect {
                DiddyProfileEffectOverlay(effect: effect, account: account)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
        }
    }

    // MARK: Name

    @ViewBuilder
    private var nameTab: some View {
        Section("Name Style") {
            Picker("Font", selection: $draft.nameFont) {
                ForEach(Rules.fontIds, id: \.self) { Text(Rules.label($0, in: Rules.fonts)).tag($0) }
            }
            Picker("Effect", selection: $draft.nameEffect) {
                ForEach(Rules.nameEffectIds, id: \.self) { Text(Rules.label($0, in: Rules.nameEffects)).tag($0) }
            }
            Toggle("Bold", isOn: $draft.nameBold)
            Toggle("Italic", isOn: $draft.nameItalic)
        }
        Section {
            Picker("Fill", selection: Binding(get: { draft.nameGradient != nil }, set: { draft.setNameGradient($0) })) {
                Text("Solid").tag(false)
                Text("Gradient").tag(true)
            }
            .pickerStyle(.segmented)
            if draft.nameGradient != nil {
                ColorPicker("Start", selection: colorBinding({ draft.nameGradient?.from }, fallback: "#7aa2f7") { draft.nameGradient?.from = $0 },
                            supportsOpacity: false)
                ColorPicker("End", selection: colorBinding({ draft.nameGradient?.to }, fallback: "#c084fc") { draft.nameGradient?.to = $0 },
                            supportsOpacity: false)
                angleRow("Angle", Binding(get: { draft.nameGradient?.angle ?? 90 }, set: { draft.nameGradient?.angle = $0 }))
            } else {
                optionalColorRow("Colour", hex: $draft.nameColor, fallback: "#ffffff")
            }
        } header: {
            Text("Name Colour")
        } footer: {
            Text("A solid colour or a two-colour gradient. Without a colour your name has the normal text colour.")
        }
    }

    // MARK: Card

    @ViewBuilder
    private var cardTab: some View {
        Section {
            optionalColorRow("Header start", hex: $draft.cardFrom, fallback: "#3a3f5c")
            optionalColorRow("Header end", hex: $draft.cardTo, fallback: "#3a3f5c")
            if draft.cardFrom != nil || draft.cardTo != nil {
                angleRow("Direction", $draft.cardAngle)
            }
            optionalColorRow("Accent", hex: $draft.cardAccent, fallback: "#7aa2f7")
        } header: {
            Text("Header & Accent")
        } footer: {
            Text("The header colours show when there is no banner. The accent colours the buttons and the outline of your card.")
        }
        Section {
            PhotosPicker(selection: $bannerItem, matching: .images) {
                Label(draft.bannerMxc == nil ? "Choose Banner" : "Replace Banner", systemImage: "photo")
            }
            .disabled(uploading != nil)
            if uploading == .banner { uploadingRow }
            if let mxc = draft.bannerMxc {
                DiddyImagePositionEditor(mxc: mxc, ratio: 640.0 / 192.0, pos: $draft.bannerPos, account: account)
                Button("Remove Banner", role: .destructive) {
                    draft.bannerMxc = nil
                    draft.bannerPos = nil
                }
            }
        } header: {
            Text("Banner")
        } footer: {
            Text("A picture or GIF at the top of your card.")
        }
        Section {
            TextField("Tell people a bit about you", text: limited($draft.bio, Rules.maxBio), axis: .vertical)
                .lineLimit(2...6)
        } header: {
            Text("About Me")
        } footer: {
            Text("\(draft.bio.unicodeScalars.count)/\(Rules.maxBio)")
        }
        Section("Info") {
            ForEach(Rules.aboutFields, id: \.self) { field in
                LabeledContent(Self.aboutLabel(field)) {
                    TextField(Self.aboutPlaceholder(field), text: Binding(
                        get: { draft.about[field] ?? "" },
                        set: { value in
                            let limited = Rules.limit(value, Rules.aboutMax(field))
                            draft.about[field] = limited.isEmpty ? nil : limited
                        }
                    ))
                    .multilineTextAlignment(.trailing)
                }
            }
        }
        Section {
            TextField("Homelab, Music, Films", text: $interestsText)
                .onChange(of: interestsText) { draft.interests = Rules.interests(from: $0) }
            if !draft.interests.isEmpty {
                FlowLayout(spacing: 6) {
                    ForEach(draft.interests, id: \.self) { interest in
                        Text(interest)
                            .font(.footnote)
                            .foregroundStyle(Theme.text)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(Capsule().fill(Theme.input))
                    }
                }
            }
        } header: {
            Text("Interests")
        } footer: {
            Text("Separate them with commas, up to \(Rules.maxInterests). \(draft.interests.count)/\(Rules.maxInterests)")
        }
        Section {
            ForEach(draft.links.indices, id: \.self) { index in linkRow(index) }
            if draft.links.count < Rules.maxLinks {
                Button { draft.links.append("") } label: { Label("Add Link", systemImage: "plus") }
            }
        } header: {
            Text("Links")
        } footer: {
            Text("GitHub, GitLab, LinkedIn, Spotify, YouTube or your own website. Only https addresses. \(draft.links.count)/\(Rules.maxLinks)")
        }
        Section("Activity") {
            Picker("Doing", selection: $draft.activityKind) {
                Text("Nothing").tag("none")
                ForEach(Rules.activityKinds, id: \.self) { kind in
                    Text(DiddyCardModules.activityTitle(kind)).tag(kind)
                }
            }
            if draft.activityKind != "none" {
                TextField("What", text: limited($draft.activityText, Rules.maxActivityLength))
                TextField("Details (optional)", text: limited($draft.activityDetail, Rules.maxActivityLength))
            }
        }
    }

    private func linkRow(_ index: Int) -> some View {
        let url = index < draft.links.count ? draft.links[index] : ""
        let trimmed = url.trimmingCharacters(in: .whitespaces)
        let kind = Rules.guessLinkKind(trimmed)
        let bad = !trimmed.isEmpty && Rules.safeLink(kind: kind, trimmed) == nil
        return HStack(spacing: 10) {
            Image(systemName: kind == "web" ? "globe" : "link").foregroundStyle(Theme.muted)
            VStack(alignment: .leading, spacing: 2) {
                TextField("https://github.com/you", text: Binding(
                    get: { index < draft.links.count ? draft.links[index] : "" },
                    set: { value in if index < draft.links.count { draft.links[index] = String(value.prefix(Rules.maxLinkLength)) } }
                ))
                .keyboardType(.URL)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                Text(bad ? "Not a valid https address" : Self.linkLabel(kind))
                    .font(.caption)
                    .foregroundStyle(bad ? Theme.danger : Theme.faint)
            }
            Button {
                if index < draft.links.count { draft.links.remove(at: index) }
            } label: {
                Image(systemName: "xmark.circle.fill").foregroundStyle(Theme.faint)
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Remove link")
        }
    }

    // MARK: Nameplate, effect, frame

    @ViewBuilder
    private var lookTab: some View {
        Section {
            Picker("Style", selection: $draft.plateFullRow) {
                Text("Fade in").tag(false)
                Text("Whole row").tag(true)
            }
            .pickerStyle(.segmented)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    presetSwatch(nil, label: "None")
                    ForEach(Rules.nameplatePresetIds, id: \.self) { id in
                        presetSwatch(id, label: Rules.label(id, in: Rules.nameplatePresets))
                    }
                }
                .padding(.vertical, 4)
            }
            if draft.platePreset != nil {
                Toggle("Flowing", isOn: $draft.plateFlow)
            } else {
                optionalColorRow("Colour", hex: $draft.plateColor, fallback: "#7aa2f7")
            }
            PhotosPicker(selection: $plateItem, matching: .any(of: [.images, .videos])) {
                Label(plateMediaTitle, systemImage: "photo.on.rectangle")
            }
            .disabled(uploading != nil)
            Button {
                importTarget = .nameplate
                importing = true
            } label: {
                Label("Import ZIP or File…", systemImage: "square.and.arrow.down")
            }
            .disabled(uploading != nil)
            if uploading == .nameplate { uploadingRow }
            if let mxc = draft.plateImageMxc {
                DiddyImagePositionEditor(mxc: mxc, ratio: 560.0 / 80.0, pos: $draft.plateImagePos, account: account)
            }
            if draft.plateImageMxc != nil || draft.plateVideoMxc != nil {
                Button(draft.plateVideoMxc != nil ? "Remove Video" : "Remove Picture", role: .destructive) {
                    draft.plateImageMxc = nil
                    draft.plateVideoMxc = nil
                    draft.plateImagePos = nil
                }
            }
        } header: {
            Text("Nameplate")
        } footer: {
            Text("The background other Diddy users see behind your row in the member and DM lists: a colour, a gradient, a picture, a GIF or a short video (up to \(Int(DiddyMediaRules.maxVideoSeconds)) seconds, muted). A nameplate ZIP with a loop and its colours can be imported too.")
        }
        Section {
            choicePicker("Effect", selection: $draft.effect, presets: Rules.effectPresets,
                         keepsCustom: original.effect == .custom, customName: storedProfile?.effect?.name)
            Button {
                importTarget = .effect
                importing = true
            } label: {
                Label("Import Own Effect…", systemImage: "square.and.arrow.down")
            }
            .disabled(uploading != nil)
            if uploading == .effect { uploadingRow }
        } header: {
            Text("Profile Effect")
        } footer: {
            Text("An animated overlay other Diddy users see over your profile card. Import your own from a ZIP effect pack or from one animated PNG, WebP or GIF with a transparent background.")
        }
        Section {
            choicePicker("Frame", selection: $draft.frame, presets: Rules.framePresets,
                         keepsCustom: original.frame == .custom, customName: storedProfile?.frame?.name)
            Button {
                importTarget = .frame
                importing = true
            } label: {
                Label("Import Own Frame…", systemImage: "square.and.arrow.down")
            }
            .disabled(uploading != nil)
            if uploading == .frame { uploadingRow }
        } header: {
            Text("Profile Frame")
        } footer: {
            Text("A decorative frame other Diddy users see around your profile card. Import your own from a ZIP frame pack or from one PNG or WebP with a transparent background.")
        }
    }

    private var storedProfile: DiddyProfile? { account.diddyProfiles[account.userId] }

    private var plateMediaTitle: String {
        if draft.plateVideoMxc != nil { return "Replace Video" }
        if draft.plateImageMxc != nil { return "Replace Picture" }
        return "Add Picture or Video"
    }

    private func presetSwatch(_ id: String?, label: String) -> some View {
        let selected = draft.platePreset == id
        let colors = (id.flatMap { DiddyNameplate.presets[$0] } ?? []).compactMap { Color(diddyHex: $0) }
        return Button {
            draft.platePreset = id
            if id == nil { draft.plateFlow = false }
        } label: {
            Text(label)
                .font(.caption.weight(.semibold))
                .foregroundStyle(colors.isEmpty ? Theme.text : .white)
                .shadow(color: .black.opacity(colors.isEmpty ? 0 : 0.4), radius: 2)
                .frame(width: 78, height: 40)
                .background {
                    if colors.count > 1 {
                        LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing)
                    } else {
                        Theme.input
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(selected ? Theme.accent : Color.clear, lineWidth: 2))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func choicePicker(_ title: String, selection: Binding<DiddyProfileDraft.Choice>, presets: [(id: String, label: String)],
                              keepsCustom: Bool, customName: String?) -> some View {
        Picker(title, selection: selection) {
            Text("None").tag(DiddyProfileDraft.Choice.none)
            ForEach(presets.map { $0.id }, id: \.self) { id in
                Text(Rules.label(id, in: presets)).tag(DiddyProfileDraft.Choice.preset(id))
            }
            if keepsCustom {
                Text("\(customName ?? "Your own") (from desktop)").tag(DiddyProfileDraft.Choice.custom)
            }
            if case .own = selection.wrappedValue {
                Text("\(DiddyProfileRules.ownName(selection.wrappedValue) ?? "Your own") (imported)").tag(selection.wrappedValue)
            }
        }
    }

    // MARK: Status and badges

    @ViewBuilder
    private var statusTab: some View {
        Section("Status") {
            Picker("Status", selection: $draft.status) {
                ForEach(Rules.statuses, id: \.self) { value in
                    Text(DiddyProfile.Status(rawValue: value)?.title ?? value).tag(value)
                }
            }
        }
        Section {
            if account.diddyOwnBadges.isEmpty {
                Text("You do not have any badges yet. Take one from the badge library or create your own.")
                    .foregroundStyle(Theme.muted)
            } else {
                ForEach(account.diddyOwnBadges) { badge in badgeRow(badge) }
            }
        } header: {
            Text("Shown Badges")
        } footer: {
            Text("Pick up to \(Rules.maxShownBadges) of your badges to show next to your name. \(draft.shownBadgeIds(owned: ownedIds).count)/\(Rules.maxShownBadges)")
        }
        Section {
            NavigationLink {
                DiddyBadgeLibraryView(account: account)
            } label: {
                Label("Badge Library", systemImage: "star.circle")
            }
            NavigationLink {
                DiddyCreateBadgeView(account: account)
            } label: {
                Label("Create a Badge", systemImage: "plus.circle")
            }
        } footer: {
            Text("Taking, creating and deleting badges is saved right away.")
        }
        Section {
            Toggle(isOn: $shareVersion) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Show My Diddy Version")
                    Text("\(DiddyClientVersion.current ?? "This version"), small on your profile card. Switched off, it is removed from your profile.")
                        .font(.caption)
                        .foregroundStyle(Theme.muted)
                }
            }
        } header: {
            Text("What Others See")
        } footer: {
            Text("Your profile card, badges and name style are shared with everyone in the data room who uses Diddy. Fields you leave empty are not shared.")
        }
    }

    private func badgeRow(_ badge: DiddyBadge) -> some View {
        let shownIds = draft.shownBadgeIds(owned: ownedIds)
        let selected = shownIds.contains(badge.id)
        let full = !selected && shownIds.count >= Rules.maxShownBadges
        return Button {
            draft.toggleBadge(badge.id, owned: ownedIds)
        } label: {
            HStack(spacing: 10) {
                DiddyBadges(badges: [badge], size: 18, account: account)
                Text(badge.name).foregroundStyle(full ? Theme.faint : Theme.text)
                Spacer()
                Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(selected ? Theme.accent : Theme.faint)
            }
        }
        .disabled(full)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    // MARK: Layout

    @ViewBuilder
    private var layoutTab: some View {
        Section {
            Picker("Layout", selection: $draft.layout) {
                ForEach(Rules.layouts, id: \.self) { Text(Self.layoutLabel($0)).tag($0) }
            }
            .pickerStyle(.segmented)
            Text(Self.layoutText(draft.layout)).font(.footnote).foregroundStyle(Theme.muted)
        } header: {
            Text("Card Layout")
        }
        Section("Look") {
            Picker("Card theme", selection: $draft.cardTheme) {
                Text("Match app").tag("auto")
                Text("Light").tag("light")
                Text("Dark").tag("dark")
            }
            Toggle(isOn: $draft.glass) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Glass effect")
                    Text("Translucent card with blur").font(.caption).foregroundStyle(Theme.muted)
                }
            }
            Toggle(isOn: $draft.calm) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Calm card")
                    Text("No hover animations").font(.caption).foregroundStyle(Theme.muted)
                }
            }
        }
        Section {
            Picker("Layout", selection: $draft.bigLayout) {
                Text("Expanded").tag("expanded")
                Text("Tabs").tag("tabs")
            }
            Picker("Banner", selection: $draft.bigBanner) {
                Text("Normal").tag("normal")
                Text("Tall").tag("tall")
                Text("Extra tall").tag("hero")
            }
            Picker("Profile picture", selection: $draft.bigAvatar) {
                Text("Normal").tag("normal")
                Text("Large").tag("large")
            }
        } header: {
            Text("Big Profile")
        } footer: {
            Text("The large view people get when they click your profile picture or your name in a call.")
        }
        Section {
            ForEach(draft.moduleOrder, id: \.self) { module in moduleRow(module) }
        } header: {
            Text("Modules")
        } footer: {
            switch draft.layout {
            case "compact": Text("The compact layout only shows the bio. Pick another layout for more modules.")
            case "tabs": Text("In the tab layout the modules are grouped into tabs; the order applies inside a tab.")
            default: Text("Show, hide and reorder the parts of your card.")
            }
        }
    }

    private func moduleRow(_ module: String) -> some View {
        let order = draft.moduleOrder
        let index = order.firstIndex(of: module) ?? 0
        let visible = !draft.hiddenModules.contains(module)
        return HStack(spacing: 10) {
            Image(systemName: Self.moduleIcon(module)).foregroundStyle(Theme.muted).frame(width: 22)
            Text(Self.moduleLabel(module)).foregroundStyle(visible ? Theme.text : Theme.faint)
            Spacer()
            Button { draft.moveModule(at: index, by: -1) } label: { Image(systemName: "chevron.up") }
                .buttonStyle(.borderless)
                .disabled(index == 0)
                .accessibilityLabel("Move up")
            Button { draft.moveModule(at: index, by: 1) } label: { Image(systemName: "chevron.down") }
                .buttonStyle(.borderless)
                .disabled(index >= order.count - 1)
                .accessibilityLabel("Move down")
            Toggle("Show \(Self.moduleLabel(module))", isOn: Binding(
                get: { !draft.hiddenModules.contains(module) },
                set: { draft.setModule(module, visible: $0) }
            ))
            .labelsHidden()
        }
    }

    // MARK: Saving

    private var saveSection: some View {
        Section {
            ForEach(draft.problems, id: \.self) { problem in
                Text(problem).foregroundStyle(Theme.danger)
            }
            if let error { Text(error).foregroundStyle(Theme.danger) }
            if let notice { Text(notice.text).foregroundStyle(notice.isError ? Theme.danger : Theme.online) }
            Button {
                Task { await save() }
            } label: {
                HStack {
                    if saving { ProgressView() }
                    Text(saved && !dirty ? "Saved" : "Save Changes")
                }
            }
            .disabled(!canSave)
            if dirty {
                Button("Discard Changes", role: .destructive) { revert() }.disabled(saving)
            }
        } footer: {
            Text(dirty ? "You have unsaved changes." : "Saved changes show for everyone in your Diddy Options room.")
        }
    }

    private func load() async {
        guard !loaded else { return }
        await account.reloadDiddyProfilesForWrite()
        let stored = DiddyProfileDraft(raw: account.diddyOwnProfileRaw ?? [:])
        draft = stored
        original = stored
        interestsText = stored.interests.joined(separator: ", ")
        shareVersion = DiddyClientVersion.shares
        originalShareVersion = shareVersion
        loaded = true
    }

    /// Reads the profile again, after the data room was set up.
    private func reload() async {
        loaded = false
        await load()
    }

    private func revert() {
        draft = original
        interestsText = original.interests.joined(separator: ", ")
        shareVersion = originalShareVersion
        error = nil
        notice = nil
    }

    private func save() async {
        guard canSave else { return }
        saving = true
        error = nil
        defer { saving = false }
        let edited = draft
        let base = original
        let share = shareVersion
        let version = DiddyClientVersion.current
        notice = nil
        do {
            // Applied to the stored profile as it is right before writing; your Diddy version is
            // stamped into it (or removed), like desktop does with every write.
            try await account.updateDiddyProfile(build: { stored in
                DiddyProfileTransfer.stampVersion(edited.apply(to: stored, since: base), version: version, share: share)
            })
            original = edited
            DiddyClientVersion.shares = share
            originalShareVersion = share
            saved = true
        } catch {
            self.error = error.friendlyMessage
        }
    }

    // MARK: Uploads

    private var uploadingRow: some View {
        HStack(spacing: 8) {
            ProgressView()
            Text("Uploading…").foregroundStyle(Theme.muted)
        }
    }

    private func uploadBanner(_ item: PhotosPickerItem) async {
        await runUpload(.banner) {
            guard let data = try await item.loadTransferable(type: Data.self) else {
                throw DiddyError("This picture could not be read.")
            }
            let limit = await account.diddyUploadLimit()
            let file = try DiddyMediaPrep.picture(data, limit: limit)
            let mxc = try await account.uploadDiddyMedia(file.data, mimeType: file.mimeType, filename: "banner.\(file.ext)")
            draft.bannerMxc = mxc
            draft.bannerPos = nil
        }
    }

    /// A picture, or a short video plus its first frame as the still picture (desktop #78).
    private func uploadNameplate(_ item: PhotosPickerItem) async {
        await runUpload(.nameplate) {
            let limit = await account.diddyUploadLimit()
            if item.supportedContentTypes.contains(where: { $0.conforms(to: .movie) }) {
                guard let movie = try await item.loadTransferable(type: DiddyPickedMovie.self) else {
                    throw DiddyError("This video could not be read.")
                }
                defer { try? FileManager.default.removeItem(at: movie.url) }
                let prepared = try await DiddyMediaPrep.nameplateVideo(movie.url, limit: limit)
                let poster = try await account.uploadDiddyMedia(prepared.poster.data, mimeType: prepared.poster.mimeType, filename: "nameplate.png")
                let video = try await account.uploadDiddyMedia(prepared.video.data, mimeType: prepared.video.mimeType, filename: "nameplate.mp4")
                draft.plateImageMxc = poster
                draft.plateVideoMxc = video
            } else {
                guard let data = try await item.loadTransferable(type: Data.self) else {
                    throw DiddyError("This picture could not be read.")
                }
                let file = try DiddyMediaPrep.picture(data, limit: limit)
                draft.plateImageMxc = try await account.uploadDiddyMedia(file.data, mimeType: file.mimeType, filename: "nameplate.\(file.ext)")
                draft.plateVideoMxc = nil
            }
            draft.plateImagePos = nil
        }
    }

    // MARK: Export, import, reset

    private var fileMenu: some View {
        Menu {
            Button {
                exportDocument = DiddyProfileDocument(text: DiddyProfileTransfer.export(draft, stored: account.diddyOwnProfileRaw ?? [:]))
                exporting = true
            } label: {
                Label("Export Profile…", systemImage: "square.and.arrow.up")
            }
            Button {
                importTarget = .profile
                importing = true
            } label: {
                Label("Import Profile…", systemImage: "square.and.arrow.down")
            }
            Button(role: .destructive) {
                draft = DiddyProfileTransfer.reset(draft)
                interestsText = ""
                error = nil
                notice = nil
            } label: {
                Label("Reset to Default", systemImage: "arrow.counterclockwise")
            }
            .disabled(!DiddyProfileTransfer.canReset(draft))
        } label: {
            Image(systemName: "ellipsis.circle")
        }
        .disabled(saving || uploading != nil)
        .accessibilityLabel("Profile file")
    }

    private var importTypes: [UTType] {
        switch importTarget {
        case .profile: return [.json]
        case .effect, .frame: return [.zip, .image]
        case .nameplate: return [.zip, .image, .movie]
        }
    }

    private func handleImport(_ result: Result<[URL], Error>) {
        guard case .success(let urls) = result, let url = urls.first else { return }
        notice = nil
        error = nil
        switch importTarget {
        case .profile:
            do {
                let data = try DiddyDecorImporter.read(url, maxBytes: DiddyProfileTransfer.maxFileBytes, tooLarge: "This file is too big to be a Diddy profile.")
                switch DiddyProfileTransfer.importProfile(String(decoding: data, as: UTF8.self)) {
                case .failed(let message):
                    notice = Notice(isError: true, text: message)
                case .imported(var imported):
                    // fills the editor only; your status and shown badges stay, nothing is saved until you press Save
                    imported.status = draft.status
                    imported.shownBadges = draft.shownBadges
                    draft = imported
                    interestsText = imported.interests.joined(separator: ", ")
                    notice = Notice(isError: false, text: "Imported. Check the preview, then press Save to keep it.")
                }
            } catch {
                notice = Notice(isError: true, text: error.friendlyMessage)
            }
        case .effect:
            Task {
                await runUpload(.effect) { draft.effect = try await DiddyDecorImporter.effect(from: url, account: account) }
            }
        case .frame:
            Task {
                await runUpload(.frame) { draft.frame = try await DiddyDecorImporter.frame(from: url, account: account) }
            }
        case .nameplate:
            Task {
                await runUpload(.nameplate) {
                    let plate = try await DiddyDecorImporter.nameplate(from: url, account: account)
                    draft.plateImageMxc = plate.imageMxc
                    draft.plateVideoMxc = plate.videoMxc
                    draft.plateImagePos = nil
                    if let color = plate.color { draft.plateColor = color }
                }
            }
        }
    }

    private func runUpload(_ kind: Upload, _ work: @MainActor () async throws -> Void) async {
        uploading = kind
        error = nil
        do {
            try await work()
        } catch {
            self.error = error.friendlyMessage
        }
        uploading = nil
    }

    // MARK: Small parts

    private func colorBinding(_ get: @escaping () -> String?, fallback: String, set: @escaping (String) -> Void) -> Binding<Color> {
        Binding(
            get: { Color(diddyHex: get() ?? fallback) ?? .white },
            set: { color in if let value = Self.hex(color) { set(value) } }
        )
    }

    /// A colour that may be unset (then the fallback shows in the picker and nothing is stored).
    private func optionalColorRow(_ title: String, hex: Binding<String?>, fallback: String) -> some View {
        HStack {
            ColorPicker(title, selection: colorBinding({ hex.wrappedValue }, fallback: fallback) { hex.wrappedValue = $0 },
                        supportsOpacity: false)
            if hex.wrappedValue != nil {
                Button("Clear") { hex.wrappedValue = nil }.buttonStyle(.borderless)
            } else {
                Text("Not set").font(.caption).foregroundStyle(Theme.faint)
            }
        }
    }

    private func angleRow(_ title: String, _ value: Binding<Double>) -> some View {
        HStack {
            Text(title)
            Slider(value: value, in: 0...360, step: 1)
            Text("\(Int(value.wrappedValue.rounded()))°")
                .monospacedDigit()
                .foregroundStyle(Theme.muted)
                .frame(width: 44, alignment: .trailing)
        }
    }

    private func limited(_ text: Binding<String>, _ max: Int) -> Binding<String> {
        Binding(get: { text.wrappedValue }, set: { text.wrappedValue = Rules.limit($0, max) })
    }

    private static func hex(_ color: Color) -> String? {
        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
        guard UIColor(color).getRed(&red, green: &green, blue: &blue, alpha: &alpha) else { return nil }
        func byte(_ value: CGFloat) -> Int { Int((min(max(value, 0), 1) * 255).rounded()) }
        return String(format: "#%02x%02x%02x", byte(red), byte(green), byte(blue))
    }

    private static func aboutLabel(_ field: String) -> String {
        switch field {
        case "pronouns": return "Pronouns"
        case "location": return "Location"
        case "age": return "Age"
        case "education": return "School / studies"
        default: return "Work"
        }
    }

    private static func aboutPlaceholder(_ field: String) -> String {
        switch field {
        case "pronouns": return "she/her"
        case "location": return "Berlin"
        case "age": return "27"
        case "education": return "Computer science"
        default: return "Developer"
        }
    }

    private static func linkLabel(_ kind: String) -> String {
        switch kind {
        case "github": return "GitHub"
        case "gitlab": return "GitLab"
        case "linkedin": return "LinkedIn"
        case "spotify": return "Spotify"
        case "youtube": return "YouTube"
        default: return "Website"
        }
    }

    private static func layoutLabel(_ layout: String) -> String {
        switch layout {
        case "compact": return "Compact"
        case "expanded": return "Expanded"
        case "tabs": return "Tabs"
        default: return "Standard"
        }
    }

    private static func layoutText(_ layout: String) -> String {
        switch layout {
        case "compact": return "Minimal, space-saving."
        case "expanded": return "More space for details."
        case "tabs": return "Organized in tabs."
        default: return "Balanced and familiar."
        }
    }

    private static func moduleLabel(_ module: String) -> String {
        switch module {
        case "about": return "Facts"
        case "bio": return "Bio"
        case "activity": return "Activity"
        case "interests": return "Interests"
        case "links": return "Links"
        default: return "Shared rooms"
        }
    }

    private static func moduleIcon(_ module: String) -> String {
        switch module {
        case "about": return "info.circle"
        case "bio": return "pencil"
        case "activity": return "play.fill"
        case "interests": return "heart"
        case "links": return "link"
        default: return "number"
        }
    }
}

/// Chooses the visible part of a banner or nameplate picture (desktop's "Visible part"): where its
/// focal point is and how far it is zoomed in, shown on the picture in the shape it is used in.
@MainActor
struct DiddyImagePositionEditor: View {
    let mxc: String
    /// Width / height of the place the picture is shown in.
    let ratio: CGFloat
    @Binding var pos: DiddyImagePos?
    let account: MatrixAccount
    @State private var image: UIImage?

    private var current: DiddyImagePos { pos ?? DiddyImagePos() }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Visible part").font(.footnote.weight(.semibold)).foregroundStyle(Theme.muted)
            GeometryReader { proxy in
                if let image {
                    let box = current.placement(imageWidth: Double(image.size.width), imageHeight: Double(image.size.height),
                                                boxWidth: Double(proxy.size.width), boxHeight: Double(proxy.size.height))
                    Image(uiImage: image)
                        .resizable()
                        .frame(width: CGFloat(box.width), height: CGFloat(box.height))
                        .position(x: CGFloat(box.x + box.width / 2), y: CGFloat(box.y + box.height / 2))
                } else {
                    Theme.input
                }
            }
            .aspectRatio(ratio, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            slider("Horizontal", \.x, range: 0...100, step: 1) { "\(Int($0.rounded())) %" }
            slider("Vertical", \.y, range: 0...100, step: 1) { "\(Int($0.rounded())) %" }
            slider("Zoom", \.zoom, range: 1...3, step: 0.05) { String(format: "%.1fx", $0) }
            Button("Reset") { pos = nil }
                .buttonStyle(.borderless)
                .disabled(pos == nil)
        }
        .padding(.vertical, 4)
        .task(id: mxc) {
            image = await MediaLoader.shared.thumbnail(url: mxc, size: 800, accountId: account.id, client: account.client)
        }
    }

    private func slider(_ title: String, _ key: WritableKeyPath<DiddyImagePos, Double>, range: ClosedRange<Double>, step: Double,
                        format: (Double) -> String) -> some View {
        HStack {
            Text(title).font(.footnote).frame(width: 84, alignment: .leading)
            Slider(value: Binding(
                get: { current[keyPath: key] },
                set: { value in
                    var next = current
                    next[keyPath: key] = (value * 100).rounded() / 100
                    pos = next
                }
            ), in: range, step: step)
            Text(format(current[keyPath: key]))
                .font(.footnote)
                .monospacedDigit()
                .foregroundStyle(Theme.muted)
                .frame(width: 44, alignment: .trailing)
        }
    }
}

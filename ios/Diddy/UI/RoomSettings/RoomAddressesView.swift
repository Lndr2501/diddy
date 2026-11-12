import SwiftUI

/// Desktop `RoomPublishedAddresses` and `RoomLocalAddresses`: the main and alternative addresses
/// shown in `m.room.canonical_alias`, and the local addresses of this homeserver.
struct RoomAddressesView: View {
    @ObservedObject var model: RoomSettingsModel
    @State private var newAlias = ""
    @State private var selected: Set<String> = []
    @State private var confirmDelete = false

    private var canEditCanonical: Bool { model.canSendState("m.room.canonical_alias") }
    private var canonical: RoomCanonicalAliasModel { model.state?.canonicalAlias ?? RoomCanonicalAliasModel(alias: nil, altAliases: []) }
    private var server: String { RoomLocalAddress.server(of: model.me) ?? "" }
    private var newAliasFull: String? {
        guard !server.isEmpty else { return nil }
        return RoomLocalAddress.localAlias(newAlias, server: server)
    }

    var body: some View {
        Form {
            if let error = model.actionError {
                Section {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundStyle(Theme.danger)
                }
            }
            publishedSection
            localSection
        }
        .scrollContentBackground(.hidden)
        .background(Theme.sidebar.ignoresSafeArea())
        .navigationTitle("Addresses")
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.loadLocalAliases() }
        .refreshable {
            await model.load()
            await model.loadLocalAliases()
        }
    }

    // MARK: Published

    private var publishedSection: some View {
        let published = canonical.published
        return Section {
            if published.isEmpty {
                VStack(alignment: .leading, spacing: 2) {
                    Text("No Addresses").font(.subheadline.weight(.semibold))
                    Text("To publish an address, it needs to be set as a local address first")
                        .font(.caption).foregroundStyle(Theme.muted)
                }
            } else {
                ForEach(published, id: \.self) { alias in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(alias)
                            if alias == canonical.alias {
                                Text("Main").font(.caption.weight(.bold)).foregroundStyle(Theme.accent)
                            }
                        }
                        Spacer()
                        if canEditCanonical {
                            if alias == canonical.alias {
                                Button("Unset Main") { setMain(nil) }.buttonStyle(.borderless)
                            } else {
                                Button("Set Main") { setMain(alias) }.buttonStyle(.borderless)
                            }
                        }
                    }
                    .disabled(model.busy)
                }
            }
        } header: {
            Text("Published Addresses")
        } footer: {
            if canEditCanonical {
                Text("If access is Public, published addresses can be used by anyone to join.")
            } else {
                Text("If access is Public, published addresses can be used by anyone to join. Your role can't change the published addresses.")
            }
        }
    }

    private func setMain(_ main: String?) {
        Task {
            await model.perform {
                try await model.sendState("m.room.canonical_alias", content: canonical.settingMain(main))
            }
        }
    }

    // MARK: Local

    private var localSection: some View {
        Section {
            if model.localAliases == nil {
                HStack { Spacer(); ProgressView(); Spacer() }
            } else if model.localAliases?.isEmpty == true {
                Text("No Addresses").font(.subheadline.weight(.semibold))
            } else {
                ForEach(model.localAliases ?? [], id: \.self) { alias in
                    Button {
                        toggle(alias)
                    } label: {
                        HStack {
                            Image(systemName: selected.contains(alias) ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(selected.contains(alias) ? Theme.accent : Theme.faint)
                            Text(alias).foregroundStyle(Theme.text)
                            Spacer()
                            if canonical.published.contains(alias) {
                                Text("Published").font(.caption.weight(.bold)).foregroundStyle(Theme.online)
                            }
                        }
                    }
                }
                if !selected.isEmpty { selectionActions }
            }
            if let error = model.localAliasError {
                Text(error).font(.footnote).foregroundStyle(Theme.danger)
            }
            HStack(spacing: 4) {
                Text("#").foregroundStyle(Theme.muted)
                TextField("address", text: $newAlias)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                Text(":\(server)").font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
                Button("Add") { addAlias() }
                    .buttonStyle(.borderless)
                    .disabled(newAliasFull == nil || model.busy)
            }
        } header: {
            Text("Local Addresses")
        } footer: {
            Text("Set local address so users can join through your homeserver.")
        }
    }

    @ViewBuilder
    private var selectionActions: some View {
        let chosen = Array(selected).sorted()
        if canEditCanonical {
            let published = chosen.filter { canonical.published.contains($0) }
            let unpublished = chosen.filter { !canonical.published.contains($0) }
            if !unpublished.isEmpty {
                Button("Publish") {
                    Task {
                        await model.perform {
                            try await model.sendState("m.room.canonical_alias", content: canonical.publishing(unpublished))
                        }
                        selected = []
                    }
                }
                .disabled(model.busy)
            }
            if !published.isEmpty {
                Button("Unpublish") {
                    Task {
                        await model.perform {
                            try await model.sendState("m.room.canonical_alias", content: canonical.unpublishing(published))
                        }
                        selected = []
                    }
                }
                .disabled(model.busy)
            }
        }
        Button(chosen.count == 1 ? "Delete Address" : "Delete \(chosen.count) Addresses", role: .destructive) {
            confirmDelete = true
        }
        .disabled(model.busy)
        .confirmationDialog("Delete the selected addresses?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                Task {
                    await model.perform {
                        for alias in chosen { try await model.deleteLocalAlias(alias) }
                    }
                    selected = []
                }
            }
        } message: {
            Text(chosen.joined(separator: "\n"))
        }
    }

    private func toggle(_ alias: String) {
        if selected.contains(alias) { selected.remove(alias) } else { selected.insert(alias) }
    }

    private func addAlias() {
        guard let alias = newAliasFull else { return }
        Task {
            let worked = await model.perform { try await model.addLocalAlias(alias) }
            if worked { newAlias = "" }
        }
    }
}

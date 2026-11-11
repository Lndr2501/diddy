import SwiftUI

@MainActor
final class PluginDockStore: ObservableObject {
    static let shared = PluginDockStore()
    @Published var state = PluginDockState.decode(UserDefaults.standard.data(forKey: "diddyPluginDock")) {
        didSet { UserDefaults.standard.set(state.encoded(), forKey: "diddyPluginDock") }
    }
}

struct PluginDockView: View {
    @ObservedObject private var plugins = PluginStore.shared
    @ObservedObject private var dock = PluginDockStore.shared
    @State private var expanded = false
    private var pinned: [UserPlugin] {
        dock.state.pinned.compactMap { id in plugins.activePlugins.first { $0.id == id } }
    }
    var body: some View {
        if !pinned.isEmpty {
            DisclosureGroup("Plugins", isExpanded: $expanded) {
                ScrollView {
                    VStack(spacing: 8) {
                        ForEach(pinned) { plugin in
                            VStack(spacing: 4) {
                                Button {
                                    dock.state.setCollapsed(plugin.id, !dock.state.collapsed.contains(plugin.id))
                                } label: {
                                    HStack {
                                        Text(plugin.name).lineLimit(1)
                                        Spacer()
                                        Image(systemName: dock.state.collapsed.contains(plugin.id) ? "chevron.right" : "chevron.down")
                                    }
                                }.font(.caption.weight(.semibold))
                                if !dock.state.collapsed.contains(plugin.id) {
                                    PluginCardView(plugin: plugin, showsTitle: false, compact: true,
                                        dockHeight: Double(dock.state.height(of: plugin.id)), dockZoom: Double(dock.state.zoom(of: plugin.id)) / 100)
                                }
                            }
                        }
                    }
                }.frame(maxHeight: 300)
            }.padding(10)
        }
    }
}

struct PluginDockControls: View {
    let plugin: UserPlugin
    @ObservedObject private var dock = PluginDockStore.shared
    var body: some View {
        Toggle("Sidebar", isOn: Binding(get: { dock.state.pinned.contains(plugin.id) }, set: { dock.state.setPinned(plugin.id, $0) }))
        if dock.state.pinned.contains(plugin.id) {
            VStack(alignment: .leading) {
                Text("Height: \(dock.state.height(of: plugin.id)) px")
                Slider(value: Binding(get: { Double(dock.state.height(of: plugin.id)) }, set: { dock.state.setHeight(plugin.id, $0) }), in: 60...320, step: 1)
                Text("Zoom: \(dock.state.zoom(of: plugin.id))%")
                Slider(value: Binding(get: { Double(dock.state.zoom(of: plugin.id)) }, set: { dock.state.setZoom(plugin.id, $0) }), in: 50...100, step: 1)
            }.font(.caption)
        }
    }
}

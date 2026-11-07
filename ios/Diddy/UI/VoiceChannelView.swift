import LiveKit
import SwiftUI

struct VoiceChannelView: View {
    @ObservedObject var account: MatrixAccount
    let roomId: String
    @EnvironmentObject private var calls: CallManager
    @State private var showChat = false
    @State private var joining = false

    private var summary: RoomSummary? { account.summary(for: roomId) }
    private var title: String { summary?.name ?? "Voice" }

    var body: some View {
        ZStack {
            Theme.rail.ignoresSafeArea()
            if let session = calls.current, session.roomId == roomId {
                ConnectedVoiceView(session: session)
            } else {
                lobby
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Theme.rail, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button { showChat = true } label: { Image(systemName: "bubble.left.fill") }
                    .accessibilityLabel("Text chat")
            }
        }
        .sheet(isPresented: $showChat) {
            NavigationStack { ChatView(account: account, roomId: roomId) }
        }
    }

    private var lobby: some View {
        VStack(spacing: 18) {
            Spacer()
            Image(systemName: "speaker.wave.2.circle.fill")
                .font(.system(size: 72))
                .foregroundStyle(Theme.accent)
            Text(title).font(.title2.bold()).foregroundStyle(Theme.text)
            if let participants = summary?.callParticipants, !participants.isEmpty {
                Text("\(participants.count) in voice").foregroundStyle(Theme.online)
                HStack(spacing: -8) {
                    ForEach(participants.prefix(6), id: \.self) { userId in
                        AvatarView(url: nil, name: String(userId.dropFirst()), size: 36)
                            .overlay(Circle().stroke(Theme.rail, lineWidth: 3))
                    }
                }
            } else {
                Text("No one is here yet.").foregroundStyle(Theme.muted)
            }
            Spacer()
            Button {
                joining = true
                Task {
                    await calls.join(account: account, roomId: roomId, roomName: title)
                    joining = false
                }
            } label: {
                HStack {
                    if joining { ProgressView().tint(.white) }
                    Text(joining ? "Connecting…" : "Join Voice").bold()
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(Capsule().fill(Theme.online))
                .foregroundStyle(.white)
            }
            .disabled(joining)
            .padding(.horizontal, 24)
            .padding(.bottom, 24)
        }
    }
}

private struct ConnectedVoiceView: View {
    @ObservedObject var session: CallSession
    @EnvironmentObject private var calls: CallManager
    @EnvironmentObject private var app: AppModel

    /// The login that joined this call: member avatars are that account's media.
    private var callAccount: MatrixAccount? { app.accounts.first { $0.id == session.accountId } }

    private var columns: [GridItem] { [GridItem(.adaptive(minimum: 150), spacing: 10)] }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(spacing: 10) {
                    // Screen shares get the full width, like Discord's stream view.
                    ForEach(session.members.filter { $0.screenShare != nil }) { member in
                        if let track = member.screenShare {
                            VideoTile(track: track, label: "\(member.name)'s screen", isScreen: true)
                        }
                    }
                    LazyVGrid(columns: columns, spacing: 10) {
                        ForEach(session.members) { member in
                            ParticipantTile(member: member, account: callAccount)
                        }
                    }
                }
                .padding(12)
            }
            if session.screenSharing && !CallSession.sharesWholeScreen {
                Text("Sharing Diddy only. Sharing other apps needs iOS 27.")
                    .font(.footnote).foregroundStyle(Theme.muted).padding(.horizontal)
            }
            if let error = session.lastError {
                Text(error).font(.footnote).foregroundStyle(Theme.danger).padding(.horizontal)
            }
            controls
        }
    }

    private var controls: some View {
        HStack(spacing: 14) {
            ControlButton(icon: session.cameraOn ? "video.fill" : "video.slash.fill", active: session.cameraOn) {
                Task { await session.toggleCamera() }
            }
            ControlButton(icon: session.microphoneOn ? "mic.fill" : "mic.slash.fill", active: session.microphoneOn, warn: !session.microphoneOn) {
                Task { await session.toggleMicrophone() }
            }
            ControlButton(icon: session.deafened ? "speaker.slash.fill" : "headphones", active: !session.deafened, warn: session.deafened) {
                Task { await session.toggleDeafen() }
            }
            ControlButton(icon: "rectangle.on.rectangle", active: session.screenSharing, highlight: session.screenSharing) {
                Task { await session.toggleScreenShare() }
            }
            ControlButton(icon: "phone.down.fill", active: true, destructive: true) {
                Task { await calls.leave() }
            }
        }
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity)
        .background(Theme.sidebar)
    }
}

private struct ControlButton: View {
    let icon: String
    var active = true
    var warn = false
    var highlight = false
    var destructive = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(warn ? Theme.danger : .white)
                .frame(width: 54, height: 54)
                .background(Circle().fill(destructive ? Theme.danger : (highlight ? Theme.accent : Theme.elevated)))
        }
    }
}

private struct ParticipantTile: View {
    let member: CallMember
    let account: MatrixAccount?

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 12).fill(Theme.elevated)
            if let camera = member.camera {
                SwiftUIVideoView(camera, layoutMode: .fill)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            } else {
                AvatarView(url: member.avatarUrl, name: member.name, size: 64, account: account)
            }
        }
        .aspectRatio(16 / 10, contentMode: .fit)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(member.isSpeaking && member.microphoneOn ? Theme.online : .clear, lineWidth: 3)
        )
        .overlay(alignment: .bottomLeading) {
            HStack(spacing: 4) {
                if !member.microphoneOn { Image(systemName: "mic.slash.fill").foregroundStyle(Theme.danger) }
                Text(member.isLocal ? "\(member.name) (you)" : member.name).lineLimit(1)
            }
            .font(.caption.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Capsule().fill(.black.opacity(0.55)))
            .padding(8)
        }
    }
}

private struct VideoTile: View {
    let track: LiveKit.VideoTrack
    let label: String
    let isScreen: Bool
    @State private var fullscreen = false

    var body: some View {
        SwiftUIVideoView(track, layoutMode: .fit)
            .aspectRatio(16 / 9, contentMode: .fit)
            .background(Color.black)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(alignment: .topLeading) {
                Label(label, systemImage: "display")
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(Capsule().fill(Theme.danger))
                    .padding(8)
            }
            .onTapGesture { fullscreen = true }
            .fullScreenCover(isPresented: $fullscreen) {
                ZStack(alignment: .topTrailing) {
                    Color.black.ignoresSafeArea()
                    SwiftUIVideoView(track, layoutMode: .fit, pinchToZoomOptions: [.zoomIn, .resetOnRelease])
                        .ignoresSafeArea()
                    Button { fullscreen = false } label: {
                        Image(systemName: "xmark.circle.fill").font(.title).foregroundStyle(.white)
                    }
                    .padding()
                }
            }
    }
}

/// Discord's green "Voice Connected" panel above the user panel.
struct VoiceStatusBar: View {
    @ObservedObject var session: CallSession
    @EnvironmentObject private var calls: CallManager

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Label(session.state, systemImage: "antenna.radiowaves.left.and.right")
                    .font(.footnote.weight(.bold))
                    .foregroundStyle(session.connected ? Theme.online : Theme.muted)
                Text(session.roomName).font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
            }
            Spacer()
            Button { Task { await session.toggleMicrophone() } } label: {
                Image(systemName: session.microphoneOn ? "mic.fill" : "mic.slash.fill")
                    .foregroundStyle(session.microphoneOn ? Theme.muted : Theme.danger)
            }
            Button { Task { await session.toggleDeafen() } } label: {
                Image(systemName: session.deafened ? "speaker.slash.fill" : "headphones")
                    .foregroundStyle(session.deafened ? Theme.danger : Theme.muted)
            }
            Button { Task { await calls.leave() } } label: {
                Image(systemName: "phone.down.fill").foregroundStyle(Theme.danger)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Theme.rail.opacity(0.85))
        .overlay(Rectangle().fill(Theme.elevated).frame(height: 1), alignment: .top)
    }
}

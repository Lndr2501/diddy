import LiveKit
import SwiftUI

struct VoiceChannelView: View {
    @ObservedObject var account: MatrixAccount
    let roomId: String
    /// Set when shown full screen over wherever the call was started.
    var showsClose = false
    @EnvironmentObject private var calls: CallManager
    @Environment(\.dismiss) private var dismiss
    @State private var showChat = false
    @State private var showMembers = false
    @State private var joining = false
    @State private var profile: ProfileTarget?

    private var summary: RoomSummary? { account.summary(for: roomId) }
    private var title: String { summary?.name ?? "Voice" }

    var body: some View {
        ZStack {
            Theme.rail.ignoresSafeArea()
            if let session = calls.current, session.roomId == roomId {
                ConnectedVoiceView(session: session) { profile = ProfileTarget(userId: $0) }
            } else {
                lobby
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Theme.rail, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .toolbar {
            if showsClose {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button { calls.showCallScreen = false } label: { Image(systemName: "chevron.down") }
                        .accessibilityLabel("Minimize call")
                }
            }
            ToolbarItemGroup(placement: .navigationBarTrailing) {
                Button { showMembers = true } label: { Image(systemName: "person.2.fill") }
                    .accessibilityLabel("Members")
                Button { showChat = true } label: { Image(systemName: "bubble.left.fill") }
                    .accessibilityLabel("Text chat")
            }
        }
        .sheet(isPresented: $showChat) {
            NavigationStack {
                ChatView(account: account, roomId: roomId, isVoiceChat: true)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button("Close") { showChat = false } }
                    }
            }
        }
        .sheet(isPresented: $showMembers) { MembersView(account: account, roomId: roomId) }
        .sheet(item: $profile) { UserProfileSheet(account: account, userId: $0.userId, roomId: roomId) }
    }

    private var lobby: some View {
        VStack(spacing: 18) {
            Spacer()
            Image(systemName: "speaker.wave.2.circle.fill")
                .font(.system(size: 72))
                .foregroundStyle(summary?.hasCall == true ? Theme.online : Theme.accent)
            Text(title).font(.title2.bold()).foregroundStyle(Theme.text)
            if let participants = summary?.callParticipants, !participants.isEmpty {
                Text(participants.count == 1 ? "1 person in voice" : "\(participants.count) people in voice")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.online)
                ScrollView {
                    VStack(spacing: 10) {
                        ForEach(participants, id: \.self) { userId in
                            Button { profile = ProfileTarget(userId: userId) } label: {
                                PersonRow(name: account.name(of: userId), avatarUrl: account.profiles[userId]?.avatarUrl, account: account)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 32)
                }
                .frame(maxHeight: 280)
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
                    Text(joining ? "Connecting…" : (calls.current == nil ? "Join Voice" : "Switch to This Channel")).bold()
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

struct ProfileTarget: Identifiable {
    let userId: String
    var id: String { userId }
}

private struct ConnectedVoiceView: View {
    @ObservedObject var session: CallSession
    let showProfile: (String) -> Void
    @EnvironmentObject private var calls: CallManager
    @EnvironmentObject private var app: AppModel

    /// The login that joined this call: member avatars are that account's media.
    private var callAccount: MatrixAccount? { app.accounts.first { $0.id == session.accountId } }

    private var columns: [GridItem] { [GridItem(.adaptive(minimum: 150), spacing: 10)] }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 6) {
                if !session.connected { ProgressView().scaleEffect(0.7) }
                Text(session.connected ? "\(session.members.count) in voice" : session.state)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(session.connected ? Theme.online : Theme.muted)
                Spacer()
            }
            .padding(.horizontal, 14)
            .padding(.top, 10)
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
                            Button { showProfile(member.userId) } label: { ParticipantTile(member: member, account: callAccount) }
                                .buttonStyle(.plain)
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
                Text(error).font(.footnote).foregroundStyle(Theme.danger).padding(.horizontal).padding(.bottom, 6)
                    .multilineTextAlignment(.center)
            }
            controls
        }
    }

    private var controls: some View {
        HStack(spacing: 10) {
            ControlButton(icon: session.speakerOn ? "speaker.wave.2.fill" : "speaker.fill", label: session.speakerOn ? "Use earpiece" : "Use speaker", active: session.speakerOn) {
                session.toggleSpeaker()
            }
            ControlButton(icon: session.cameraOn ? "video.fill" : "video.slash.fill", label: session.cameraOn ? "Turn off camera" : "Turn on camera", active: session.cameraOn) {
                Task { await session.toggleCamera() }
            }
            ControlButton(icon: session.microphoneOn ? "mic.fill" : "mic.slash.fill", label: session.microphoneOn ? "Mute" : "Unmute", active: session.microphoneOn, warn: !session.microphoneOn) {
                Task { await session.toggleMicrophone() }
            }
            ControlButton(icon: session.deafened ? "speaker.slash.fill" : "headphones", label: session.deafened ? "Undeafen" : "Deafen", active: !session.deafened, warn: session.deafened) {
                Task { await session.toggleDeafen() }
            }
            ControlButton(icon: "rectangle.on.rectangle", label: session.screenSharing ? "Stop sharing screen" : "Share screen", active: session.screenSharing, highlight: session.screenSharing) {
                Task { await session.toggleScreenShare() }
            }
            ControlButton(icon: "phone.down.fill", label: "Leave call", active: true, destructive: true) {
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
    let label: String
    var active = true
    var warn = false
    var highlight = false
    var destructive = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(warn ? Theme.danger : .white)
                .frame(width: 50, height: 50)
                .background(Circle().fill(destructive ? Theme.danger : (highlight ? Theme.accent : Theme.elevated)))
        }
        .accessibilityLabel(label)
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
                // Sits a little high so the name pill below never covers it.
                AvatarView(url: member.avatarUrl, name: member.name, size: 52, account: account)
                    .offset(y: -12)
            }
        }
        .aspectRatio(16 / 10, contentMode: .fit)
        .opacity(member.isConnecting ? 0.55 : 1)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(member.isSpeaking && member.microphoneOn ? Theme.online : .clear, lineWidth: 3)
        )
        .overlay(alignment: .bottomLeading) {
            HStack(spacing: 4) {
                if member.isConnecting {
                    ProgressView().scaleEffect(0.6).frame(width: 12, height: 12)
                } else if !member.microphoneOn {
                    Image(systemName: "mic.slash.fill").foregroundStyle(Theme.danger)
                }
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

/// Discord's green "Voice Connected" panel above the user panel. Tapping it opens the call.
struct VoiceStatusBar: View {
    @ObservedObject var session: CallSession
    @EnvironmentObject private var calls: CallManager

    var body: some View {
        HStack(spacing: 4) {
            Button { calls.showCallScreen = true } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Label(session.state, systemImage: "antenna.radiowaves.left.and.right")
                        .font(.footnote.weight(.bold))
                        .foregroundStyle(session.connected ? Theme.online : Theme.muted)
                    Text("\(session.roomName) · \(session.members.count) in voice")
                        .font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Open call")
            barButton(session.microphoneOn ? "mic.fill" : "mic.slash.fill", tint: session.microphoneOn ? Theme.muted : Theme.danger, label: session.microphoneOn ? "Mute" : "Unmute") {
                Task { await session.toggleMicrophone() }
            }
            barButton(session.deafened ? "speaker.slash.fill" : "headphones", tint: session.deafened ? Theme.danger : Theme.muted, label: session.deafened ? "Undeafen" : "Deafen") {
                Task { await session.toggleDeafen() }
            }
            barButton("phone.down.fill", tint: Theme.danger, label: "Leave call") {
                Task { await calls.leave() }
            }
        }
        .padding(.leading, 14)
        .padding(.trailing, 4)
        .padding(.vertical, 4)
        .background(Theme.rail.opacity(0.85))
        .overlay(Rectangle().fill(Theme.elevated).frame(height: 1), alignment: .top)
    }

    private func barButton(_ icon: String, tint: Color, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).foregroundStyle(tint).frame(width: 40, height: 44)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// On top of a chat: the call you are in, or the one you could join here.
struct CallBanner: View {
    @ObservedObject var account: MatrixAccount
    let summary: RoomSummary?
    let roomId: String
    let title: String
    @EnvironmentObject private var calls: CallManager

    var body: some View {
        if let session = calls.current {
            OngoingCallBanner(session: session)
        } else if let participants = summary?.callParticipants, !participants.isEmpty {
            Button {
                Task { await calls.join(account: account, roomId: roomId, roomName: title, showCallScreen: true) }
            } label: {
                HStack(spacing: 8) {
                    HStack(spacing: -6) {
                        ForEach(participants.prefix(4), id: \.self) { userId in
                            AvatarView(url: account.profiles[userId]?.avatarUrl, name: account.name(of: userId), size: 24, account: account)
                                .overlay(Circle().stroke(Theme.online, lineWidth: 1.5))
                        }
                    }
                    Text(participants.count == 1 ? "\(account.name(of: participants[0])) is in a call" : "\(participants.count) people are in a call")
                        .font(.footnote.weight(.semibold))
                        .lineLimit(1)
                    Spacer()
                    Text("Join").font(.footnote.bold())
                        .padding(.horizontal, 12).padding(.vertical, 4)
                        .background(Capsule().fill(.white.opacity(0.2)))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background(Theme.online)
            }
            .buttonStyle(.plain)
        }
    }
}

private struct OngoingCallBanner: View {
    @ObservedObject var session: CallSession
    @EnvironmentObject private var calls: CallManager

    var body: some View {
        Button { calls.showCallScreen = true } label: {
            HStack(spacing: 8) {
                Image(systemName: session.microphoneOn ? "waveform" : "mic.slash.fill")
                Text("\(session.roomName) · \(session.members.count) in voice").font(.footnote.weight(.semibold)).lineLimit(1)
                Spacer()
                Text("Return").font(.footnote.bold())
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Theme.online)
        }
        .buttonStyle(.plain)
    }
}

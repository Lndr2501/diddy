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
                    await calls.requestJoin(account: account, roomId: roomId, roomName: title)
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
    @ObservedObject private var extras: CallLiveExtras
    let showProfile: (String) -> Void
    @EnvironmentObject private var calls: CallManager
    @EnvironmentObject private var app: AppModel

    init(session: CallSession, showProfile: @escaping (String) -> Void) {
        self.session = session
        self.showProfile = showProfile
        _extras = ObservedObject(wrappedValue: session.extras)
    }

    /// The login that joined this call: member avatars are that account's media.
    private var callAccount: MatrixAccount? { app.accounts.first { $0.id == session.accountId } }

    var body: some View {
        VStack(spacing: 0) {
            CallStatusHeader(session: session, extras: extras)
            // The video of Watch together above the stage (beside it in landscape), then one tile
            // per person and per screen share; a tap focuses one (CallStageView.swift).
            WatchTogetherStage(watch: session.watchTogether) {
                CallStageView(session: session, account: callAccount, showProfile: showProfile)
            }
            notices
            controls
        }
    }

    @ViewBuilder
    private var notices: some View {
        if session.screenSharing && !CallSession.sharesWholeScreen {
            Label("Sharing Diddy only. Sharing other apps needs iOS 27.", systemImage: "info.circle")
                .font(.footnote)
                .foregroundStyle(Theme.muted)
                .padding(.horizontal)
                .padding(.bottom, 6)
        }
        if let error = session.lastError {
            Label(error, systemImage: "exclamationmark.triangle.fill")
                .font(.footnote)
                .foregroundStyle(Theme.danger)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
                .padding(.bottom, 6)
        }
    }

    /// The core actions in one row, like FaceTime: speaker, camera, microphone, share, more, leave.
    /// Each button gets an equal share of the width, so it fits the iPhone SE and landscape.
    private var controls: some View {
        HStack(spacing: 0) {
            Button { session.toggleSpeaker() } label: {
                CallBarIcon(icon: session.speakerOn ? "speaker.wave.2.fill" : "speaker.fill", highlight: session.speakerOn)
            }
            .accessibilityLabel("Speaker")
            .accessibilityValue(session.speakerOn ? "On" : "Off")
            .frame(maxWidth: .infinity)
            Button { Task { await session.toggleCamera() } } label: {
                CallBarIcon(icon: session.cameraOn ? "video.fill" : "video.slash.fill", highlight: session.cameraOn)
            }
            .accessibilityLabel("Camera")
            .accessibilityValue(session.cameraOn ? "On" : "Off")
            .frame(maxWidth: .infinity)
            Button { Task { await session.toggleMicrophone() } } label: {
                CallBarIcon(icon: session.microphoneOn ? "mic.fill" : "mic.slash.fill", warn: !session.microphoneOn)
            }
            .accessibilityLabel("Microphone")
            .accessibilityValue(session.microphoneOn ? "On" : "Muted")
            .frame(maxWidth: .infinity)
            ShareControl(session: session, extras: extras)
                .frame(maxWidth: .infinity)
            CallMoreButton(session: session, extras: extras, watch: session.watchTogether)
                .frame(maxWidth: .infinity)
            Button { Task { await calls.leave() } } label: {
                CallBarIcon(icon: "phone.down.fill", destructive: true)
            }
            .accessibilityLabel("Leave call")
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 8)
        .padding(.top, 12)
        .padding(.bottom, 10)
        .frame(maxWidth: 520)
        .frame(maxWidth: .infinity)
        .background(Theme.sidebar.ignoresSafeArea(edges: .bottom))
    }
}

/// The line above the stage: connecting, ringing, reconnecting or how many are here, a "Deafened"
/// chip (a tap undeafens) and the ping.
private struct CallStatusHeader: View {
    @ObservedObject var session: CallSession
    @ObservedObject var extras: CallLiveExtras

    private var reconnecting: Bool { session.isReconnecting }

    /// One lit bar: the round trip is 250 ms or more.
    private var weakConnection: Bool {
        guard session.connected, let ms = extras.pingMs else { return false }
        return CallPing.bars(forMs: ms) == 1
    }

    private var busy: Bool { !session.connected || reconnecting || session.outgoing == .ringing }

    private var text: String {
        switch session.outgoing {
        case .ringing: return "Ringing…"
        case .noAnswer: return "No answer"
        case .none: break
        }
        if reconnecting { return "Reconnecting…" }
        guard session.connected else { return session.state }
        let count = session.members.count
        let people = count == 1 ? "1 in voice" : "\(count) in voice"
        return weakConnection ? "\(people) · Weak connection" : people
    }

    private var color: Color {
        if reconnecting || weakConnection { return Color.orange }
        if session.connected && session.outgoing != .noAnswer { return Theme.online }
        return Theme.muted
    }

    var body: some View {
        HStack(spacing: 8) {
            if busy { ProgressView().scaleEffect(0.7).frame(width: 16, height: 16) }
            Text(text)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(color)
                .lineLimit(1)
            Spacer(minLength: 4)
            if session.deafened {
                Button { Task { await session.toggleDeafen() } } label: {
                    Label("Deafened", systemImage: "speaker.slash.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Capsule().fill(Theme.danger))
                        .frame(minHeight: 36)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Deafened")
                .accessibilityHint("Undeafens you")
            }
            if session.connected { PingBadge(extras: extras) }
        }
        .padding(.horizontal, 14)
        .frame(minHeight: 36)
        .accessibilityElement(children: .contain)
    }
}

extension CallSession {
    /// LiveKit lost the server and is trying again (`state` is "Reconnecting…" then).
    fileprivate var isReconnecting: Bool { state.hasPrefix("Reconnecting") }

    /// The status colour of the call bars: orange while reconnecting, green when connected.
    fileprivate var statusColor: Color {
        if isReconnecting { return Color.orange }
        return connected ? Theme.online : Theme.muted
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
                        .foregroundStyle(session.statusColor)
                        .lineLimit(1)
                    Text("\(session.roomName) · \(session.members.count) in voice")
                        .font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(session.roomName), \(session.state), \(session.members.count) in voice")
            .accessibilityHint("Opens the call")
            .accessibilityAddTraits(.isButton)
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
            Image(systemName: icon).foregroundStyle(tint).frame(width: 44, height: 44).contentShape(Rectangle())
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
                Task { await calls.requestJoin(account: account, roomId: roomId, roomName: title, showCallScreen: true) }
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
                .frame(minHeight: 44)
                .background(Theme.online)
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(participants.count == 1 ? "\(account.name(of: participants[0])) is in a call" : "\(participants.count) people are in a call")
            .accessibilityHint("Joins the call")
            .accessibilityAddTraits(.isButton)
        }
    }
}

private struct OngoingCallBanner: View {
    @ObservedObject var session: CallSession
    @EnvironmentObject private var calls: CallManager

    var body: some View {
        Button { calls.showCallScreen = true } label: {
            HStack(spacing: 8) {
                if session.isReconnecting {
                    ProgressView().tint(.white).scaleEffect(0.7).frame(width: 16, height: 16)
                } else {
                    Image(systemName: session.microphoneOn ? "waveform" : "mic.slash.fill")
                }
                Text(session.isReconnecting ? "\(session.roomName) · Reconnecting…" : "\(session.roomName) · \(session.members.count) in voice")
                    .font(.footnote.weight(.semibold))
                    .lineLimit(1)
                Spacer()
                Text("Return").font(.footnote.bold())
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .frame(minHeight: 44)
            .background(session.isReconnecting ? Color.orange : Theme.online)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(session.microphoneOn ? "In a call in \(session.roomName)" : "In a call in \(session.roomName), muted")
        .accessibilityHint("Returns to the call")
        .accessibilityAddTraits(.isButton)
    }
}

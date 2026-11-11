import SwiftUI

/// "Redet mit Agent": a small badge for any tile or card (#131).
struct AgentTalkingBadge: View {
    var compact = false

    var body: some View {
        Label("Redet mit Agent", systemImage: "waveform")
            .labelStyle(.titleAndIcon)
            .font((compact ? Font.caption2 : Font.caption).weight(.semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Capsule().fill(Theme.accent))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Redet mit Agent")
    }
}

/// The toggle in the voice channel controls: mutes the microphone while you dictate to an agent
/// (with a dictation app or the keyboard's own dictation) and tells the others in the call.
struct AgentVoiceButton: View {
    @ObservedObject var session: CallSession

    var body: some View {
        Button {
            Task { await session.setTalkingToAgent(!session.talkingToAgent) }
        } label: {
            Label(session.talkingToAgent ? "Redet mit Agent – beenden" : "Mit Agent reden", systemImage: "waveform")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, 16)
                .padding(.vertical, 9)
                .background(Capsule().fill(session.talkingToAgent ? Theme.accent : Theme.elevated))
        }
        .disabled(!session.connected)
        .accessibilityLabel(session.talkingToAgent ? "Mit Agent reden beenden" : "Mit Agent reden")
        .accessibilityHint("Schaltet dein Mikrofon stumm und zeigt den anderen im Call, dass du mit einem Agenten redest.")
    }
}

/// On the profile card: shown while this person talks to an agent in the call you are in.
struct AgentTalkingProfileBadge: View {
    let userId: String
    @EnvironmentObject private var calls: CallManager

    var body: some View {
        if let session = calls.current {
            Inner(session: session, userId: userId)
        }
    }

    private struct Inner: View {
        @ObservedObject var session: CallSession
        let userId: String

        var body: some View {
            if session.agentTalkingUsers.contains(userId) || (userId == session.ownUserIdForUI && session.talkingToAgent) {
                AgentTalkingBadge().padding(.top, 4)
            }
        }
    }
}

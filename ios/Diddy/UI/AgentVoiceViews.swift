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
            if session.agentTalkingUsers.contains(userId) {
                AgentTalkingBadge().padding(.top, 4)
            }
        }
    }
}

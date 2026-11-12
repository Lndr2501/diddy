import SwiftUI

/// Sizes, spacing and fonts of the chat timeline, in one place. The fonts are text styles, so
/// Dynamic Type and the in-app zoom still scale them. Like the calmer desktop timeline (1.7.0):
/// message text one step below the system body, small round avatars, tight groups.
enum ChatStyle {
    /// Message text.
    static let bodyFont: Font = .subheadline
    /// The sender above the first message of a group.
    static let nameFont: Font = .subheadline.weight(.semibold)
    /// Point size of `nameFont`, for the custom name fonts of Diddy profiles.
    static let nameSize: CGFloat = 15
    /// The short time behind the name; the day is in the divider.
    static let timeFont: Font = .caption2
    /// Lines about the room (joins, calls).
    static let noticeFont: Font = .caption
    /// Round avatar beside the first message of a group.
    static let avatarSize: CGFloat = 36
    static let avatarSpacing: CGFloat = 10
    /// Left and right edge of every row.
    static let edgePadding: CGFloat = 16
    /// Where the text of a message starts. Replies, threads and pins line up with it.
    static var textLeading: CGFloat { edgePadding + avatarSize + avatarSpacing }
    /// Space above the first message of a group and above a message that continues one.
    static let groupTopPadding: CGFloat = 10
    static let continuationTopPadding: CGFloat = 2
    /// Apple's smallest touch target.
    static let minTapSize: CGFloat = 44

    /// "Today", "Yesterday" or the date, like the desktop's day divider.
    static func dayTitle(_ day: Date) -> String {
        switch TimelineLayout.day(of: day) {
        case .today: return "Today"
        case .yesterday: return "Yesterday"
        case .earlier: return day.formatted(date: .long, time: .omitted)
        }
    }
}

/// The quiet day label above the first row of a day, without lines.
struct ChatDayDivider: View {
    let day: Date

    var body: some View {
        Text(ChatStyle.dayTitle(day))
            .font(.caption2.weight(.semibold))
            .foregroundStyle(Theme.faint)
            .frame(maxWidth: .infinity)
            .padding(.top, 14)
            .padding(.bottom, 2)
            .accessibilityAddTraits(.isHeader)
    }
}

/// On top of a chat: the call you are in, or the one you could join here. A slim capsule in a
/// soft tint of the call colour instead of a full-width bar; the whole row is one touch target.
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
            let label = participants.count == 1 ? "\(account.name(of: participants[0])) is in a call" : "\(participants.count) people are in a call"
            Button {
                Task { await calls.requestJoin(account: account, roomId: roomId, roomName: title, showCallScreen: true) }
            } label: {
                CallStrip(tint: Theme.online) {
                    HStack(spacing: -5) {
                        ForEach(participants.prefix(3), id: \.self) { userId in
                            AvatarView(url: account.profiles[userId]?.avatarUrl, name: account.name(of: userId), size: 20, account: account)
                                .overlay(Circle().stroke(Theme.chat, lineWidth: 1.5))
                        }
                    }
                    Text(label)
                        .font(.footnote.weight(.medium))
                        .foregroundStyle(Theme.text)
                        .lineLimit(1)
                } trailing: {
                    Text("Join").font(.footnote.weight(.semibold)).foregroundStyle(Theme.online)
                }
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(label)
            .accessibilityHint("Joins the call")
            .accessibilityAddTraits(.isButton)
        }
    }
}

private struct OngoingCallBanner: View {
    @ObservedObject var session: CallSession
    @EnvironmentObject private var calls: CallManager

    private var tint: Color { session.isReconnecting ? .orange : Theme.online }
    private var status: String { session.isReconnecting ? "Reconnecting…" : "\(session.members.count) in voice" }

    var body: some View {
        Button { calls.showCallScreen = true } label: {
            CallStrip(tint: tint) {
                Group {
                    if session.isReconnecting {
                        ProgressView().scaleEffect(0.6)
                    } else {
                        Image(systemName: session.microphoneOn ? "waveform" : "mic.slash.fill")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(session.microphoneOn ? tint : Theme.muted)
                    }
                }
                .frame(width: 16, height: 16)
                (Text(session.roomName).fontWeight(.semibold).foregroundColor(Theme.text)
                    + Text(" · \(status)").foregroundColor(Theme.muted))
                    .font(.footnote)
                    .lineLimit(1)
            } trailing: {
                Text("Return").font(.footnote.weight(.semibold)).foregroundStyle(tint)
            }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(session.microphoneOn ? "In a call in \(session.roomName)" : "In a call in \(session.roomName), muted")
        .accessibilityHint("Returns to the call")
        .accessibilityAddTraits(.isButton)
    }
}

/// The capsule of the call hint: what is going on on the left, the action on the right.
private struct CallStrip<Leading: View, Trailing: View>: View {
    let tint: Color
    let leading: Leading
    let trailing: Trailing

    init(tint: Color, @ViewBuilder leading: () -> Leading, @ViewBuilder trailing: () -> Trailing) {
        self.tint = tint
        self.leading = leading()
        self.trailing = trailing()
    }

    var body: some View {
        HStack(spacing: 8) {
            leading
            Spacer(minLength: 8)
            trailing
        }
        .padding(.horizontal, 12)
        .frame(minHeight: 34)
        .background(Capsule().fill(tint.opacity(0.12)))
        .overlay(Capsule().strokeBorder(tint.opacity(0.25), lineWidth: 1))
        .padding(.horizontal, 12)
        .padding(.vertical, 5)
        .frame(maxWidth: .infinity, minHeight: ChatStyle.minTapSize)
        .contentShape(Rectangle())
        .background(Theme.chat)
    }
}

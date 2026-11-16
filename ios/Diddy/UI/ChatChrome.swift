import SwiftUI
import UIKit

/// Sizes, spacing and fonts of the chat timeline, in one place. The fonts are text styles, so
/// Dynamic Type and the in-app zoom still scale them. Calm and roomy: regular weight text, white
/// names, small round avatars, air between the groups of different people.
enum ChatStyle {
    /// Message text.
    static let bodyFont: Font = .callout
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
    static let groupTopPadding: CGFloat = 14
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
                    Text(L("call.prescreenControls.join")).font(.footnote.weight(.semibold)).foregroundStyle(Theme.online)
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
                Text(L("ios.chatMore.return")).font(.footnote.weight(.semibold)).foregroundStyle(tint)
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

// MARK: Header

/// The flat bar above a chat, drawn by the chat itself instead of the system navigation bar (no
/// glass capsules): back on iPhone, the person or room with its status, call, and the menu.
struct ChatHeader<MenuContent: View>: View {
    @ObservedObject var account: MatrixAccount
    let summary: RoomSummary?
    let title: String
    /// Nil where there is nothing to go back to (the iPad shows the list beside the chat).
    let onBack: (() -> Void)?
    let onInfo: () -> Void
    let onCall: () -> Void
    /// Whether the iPad's member column is shown; nil hides the button (iPhone opens a sheet from the menu).
    let membersOpen: Bool?
    let onToggleMembers: () -> Void
    let menu: () -> MenuContent

    init(account: MatrixAccount, summary: RoomSummary?, title: String, onBack: (() -> Void)?,
         onInfo: @escaping () -> Void, onCall: @escaping () -> Void,
         membersOpen: Bool? = nil, onToggleMembers: @escaping () -> Void = {},
         @ViewBuilder menu: @escaping () -> MenuContent) {
        self.account = account
        self.summary = summary
        self.title = title
        self.onBack = onBack
        self.onInfo = onInfo
        self.onCall = onCall
        self.membersOpen = membersOpen
        self.onToggleMembers = onToggleMembers
        self.menu = menu
    }

    var body: some View {
        HStack(spacing: 2) {
            if let onBack {
                Button(action: onBack) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(Theme.text)
                        .frame(width: 36, height: ChatStyle.minTapSize)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L("settings.insetList.back"))
            }
            Button(action: onInfo) {
                HStack(spacing: 10) {
                    picture
                    VStack(alignment: .leading, spacing: 1) {
                        Text(title).font(.headline).foregroundStyle(Theme.text).lineLimit(1)
                        subtitle
                    }
                    Spacer(minLength: 0)
                }
                .frame(minHeight: ChatStyle.minTapSize)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.leading, onBack == nil ? 10 : 0)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("\(title), channel details")
            .accessibilityAddTraits(.isButton)
            if let membersOpen {
                Button(action: onToggleMembers) { icon(membersOpen ? "person.2.fill" : "person.2") }
                    .buttonStyle(.plain)
                    .accessibilityLabel(membersOpen ? "Hide member list" : "Show member list")
            }
            Button(action: onCall) { icon("phone") }
                .buttonStyle(.plain)
                .accessibilityLabel(L("ios.chatMore.startVoiceCall"))
            Menu { menu() } label: { icon("info.circle") }
                .accessibilityLabel(L("settings.plugins.more"))
        }
        .padding(.horizontal, 6)
        .frame(height: 54)
        .frame(maxWidth: .infinity)
        .background(Theme.chat)
        .overlay(alignment: .bottom) { Rectangle().fill(Theme.text.opacity(0.07)).frame(height: 1) }
    }

    private func icon(_ name: String) -> some View {
        Image(systemName: name)
            .font(.system(size: 19))
            .foregroundStyle(Theme.muted)
            .frame(width: ChatStyle.minTapSize, height: ChatStyle.minTapSize)
            .contentShape(Rectangle())
    }

    @ViewBuilder private var picture: some View {
        if let summary, summary.isDirect {
            AvatarView(url: summary.avatarUrl, name: title, size: 34, account: account)
                .overlay(alignment: .bottomTrailing) {
                    PresenceDot(userId: summary.dmUserId, account: account, size: 10, ring: Theme.chat, onDemand: true).offset(x: 2, y: 2)
                }
        } else {
            Image(systemName: "number")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.muted)
                .frame(width: 34, height: 34)
                .background(Circle().fill(Theme.elevated))
        }
    }

    /// The other person's status in a DM, the number of members in a room.
    @ViewBuilder private var subtitle: some View {
        if let summary, summary.isDirect, let userId = summary.dmUserId {
            PresenceSubtitle(userId: userId, store: PresenceStore.of(account))
        } else if let summary, summary.memberCount > 0 {
            Text(summary.memberCount == 1 ? "1 member" : "\(summary.memberCount) members")
                .font(.caption)
                .foregroundStyle(Theme.muted)
                .lineLimit(1)
        }
    }
}

private struct PresenceSubtitle: View {
    let userId: String
    @ObservedObject var store: PresenceStore

    var body: some View {
        if let state = store.state(of: userId) {
            Text(state.title).font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
        }
    }
}

/// The chat hides the system navigation bar for its own header, which would also switch off the
/// swipe back from the left edge. This keeps the swipe for every stack deeper than its root.
extension UINavigationController: UIGestureRecognizerDelegate {
    override open func viewDidLoad() {
        super.viewDidLoad()
        interactivePopGestureRecognizer?.delegate = self
    }

    public func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        guard gestureRecognizer === interactivePopGestureRecognizer else { return true }
        return viewControllers.count > 1
    }
}

/// Swipe from the left edge back to the chat list (#211). On iPhone the chat sits in the
/// detail's own NavigationStack, whose root cannot pop, so the system swipe above does not reach
/// the split view behind it. This strip at the edge does it instead: the chat follows the finger,
/// and past a third of the width (or with a flick) it slides out and the list comes back.
struct EdgeSwipeBack: View {
    @Binding var offset: CGFloat
    let onBack: () -> Void

    var body: some View {
        Color.clear
            .frame(width: 20)
            .frame(maxHeight: .infinity)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 6, coordinateSpace: .global)
                    .onChanged { value in
                        offset = max(0, value.translation.width)
                    }
                    .onEnded { value in
                        let width = UIScreen.main.bounds.width
                        let done = value.translation.width > width / 3 || value.predictedEndTranslation.width > width * 0.6
                        guard done else {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.9)) { offset = 0 }
                            return
                        }
                        withAnimation(.easeOut(duration: 0.18)) { offset = width }
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
                            // The chat is already gone; the pop itself must not slide it again.
                            var transaction = Transaction()
                            transaction.disablesAnimations = true
                            withTransaction(transaction) { onBack() }
                            offset = 0
                        }
                    }
            )
            .accessibilityHidden(true)
    }
}

/// How far the chat is pulled aside by EdgeSwipeBack, for the list underneath (MainView moves it
/// back in as the chat moves out).
struct ChatEdgeOffsetKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
}

/// True where the chat stands beside the chat list (iPhone in landscape, MainView): no back button
/// and no edge swipe, the list is right there.
private struct ChatBesideListKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    var chatBesideList: Bool {
        get { self[ChatBesideListKey.self] }
        set { self[ChatBesideListKey.self] = newValue }
    }
}

// MARK: Timeline extras

/// The typing pill when someone types. Observes only the room's TypingStore, so a change redraws
/// the pill and not the whole chat.
struct TypingIndicator: View {
    @ObservedObject var store: TypingStore
    /// Names that arrive after the pill appeared.
    @ObservedObject var people: AccountDetails
    let account: MatrixAccount
    let roomId: String

    var body: some View {
        let ids = store.userIds
        if !ids.isEmpty {
            TypingPill(names: ids.map { account.name(of: $0) })
                .transition(.opacity)
                .onAppear { account.resolveProfiles(ids, in: roomId) }
        }
    }
}

/// "Lndr is typing" floating over the bottom left of the chat, so nothing below it moves.
struct TypingPill: View {
    let names: [String]

    var body: some View {
        HStack(spacing: 6) {
            HStack(spacing: 2) {
                ForEach(0..<3, id: \.self) { _ in Circle().fill(Theme.muted).frame(width: 4, height: 4) }
            }
            Text(TypingPill.text(names)).lineLimit(1)
        }
        .font(.caption.weight(.medium))
        .foregroundStyle(Theme.muted)
        .padding(.leading, 9)
        .padding(.trailing, 11)
        .padding(.vertical, 5)
        .background(Capsule().fill(Theme.elevated.opacity(0.95)))
        .overlay(Capsule().strokeBorder(Theme.text.opacity(0.07), lineWidth: 1))
        .padding(.leading, 12)
        .padding(.bottom, 4)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(TypingPill.text(names))
    }

    static func text(_ names: [String]) -> String {
        switch names.count {
        case 1: return "\(names[0]) is typing…"
        case 2: return "\(names[0]) and \(names[1]) are typing…"
        default: return "Several people are typing…"
        }
    }
}

/// The bend from the avatar column up to the quoted message above a reply.
struct ReplyConnector: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let radius = min(6, rect.height, rect.width)
        path.move(to: CGPoint(x: rect.minX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + radius))
        path.addQuadCurve(to: CGPoint(x: rect.minX + radius, y: rect.minY), control: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        return path
    }
}

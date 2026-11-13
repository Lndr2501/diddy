import SwiftUI
import UIKit

/// Long press on a message: the chat dims, the quick reactions sit above the message, and the
/// actions slide up from the bottom. An overlay and not a sheet, so an action can open its own
/// sheet (thread, report, emoji picker) right away.
struct MessageActionsOverlay<Actions: View>: View {
    let row: MessageRow
    @ObservedObject var account: MatrixAccount
    let onReact: (String) -> Void
    let onMoreReactions: () -> Void
    let onClose: () -> Void
    let actions: () -> Actions
    @State private var shown = false

    init(row: MessageRow, account: MatrixAccount, onReact: @escaping (String) -> Void, onMoreReactions: @escaping () -> Void,
         onClose: @escaping () -> Void, @ViewBuilder actions: @escaping () -> Actions) {
        self.row = row
        self.account = account
        self.onReact = onReact
        self.onMoreReactions = onMoreReactions
        self.onClose = onClose
        self.actions = actions
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            Color.black.opacity(0.55)
                .ignoresSafeArea()
                .contentShape(Rectangle())
                .onTapGesture(perform: onClose)
                .accessibilityLabel("Close")
                .accessibilityAddTraits(.isButton)
            VStack(spacing: 10) {
                Spacer(minLength: 12)
                reactionBar
                preview
                Spacer(minLength: 12)
                panel
            }
            .offset(y: shown ? 0 : 40)
            .opacity(shown ? 1 : 0)
        }
        .onAppear {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            withAnimation(.spring(response: 0.3, dampingFraction: 0.86)) { shown = true }
        }
    }

    /// Six quick reactions and the full picker, in one floating capsule.
    private var reactionBar: some View {
        HStack(spacing: 2) {
            ForEach(Array(ReactionEmoji.quick.prefix(6)), id: \.self) { emoji in
                Button { onReact(emoji) } label: {
                    Text(emoji).font(.system(size: 26)).frame(width: 42, height: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("React with \(emoji)")
            }
            Button(action: onMoreReactions) {
                Image(systemName: "plus")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Theme.muted)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(Theme.text.opacity(0.1)))
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("More Emoji")
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .background(Capsule().fill(Theme.elevated))
        .overlay(Capsule().strokeBorder(Theme.text.opacity(0.08), lineWidth: 1))
        .shadow(color: .black.opacity(0.4), radius: 16, y: 6)
    }

    /// The message itself, lifted out of the chat.
    private var preview: some View {
        HStack(alignment: .top, spacing: ChatStyle.avatarSpacing) {
            AvatarView(url: row.senderAvatar, name: row.senderName, size: ChatStyle.avatarSize, account: account)
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(row.senderName).font(ChatStyle.nameFont).foregroundStyle(Theme.text).lineLimit(1)
                    Text(ChatSettings.time(row.date)).font(ChatStyle.timeFont).foregroundStyle(Theme.faint)
                }
                Text(previewText).font(ChatStyle.bodyFont).foregroundStyle(Theme.text).lineLimit(6)
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Theme.chat))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Theme.text.opacity(0.08), lineWidth: 1))
        .shadow(color: .black.opacity(0.4), radius: 16, y: 6)
        .padding(.horizontal, 14)
        .accessibilityElement(children: .combine)
    }

    private var previewText: String {
        switch row.body {
        case .text(let text): return MentionText.readable(text) { account.name(of: $0) }
        case .image: return row.isSticker ? "Sticker" : "Photo"
        case .file(let name, _, _): return name
        case .audio: return "Voice message"
        case .notice(let text): return text
        case .undecryptable: return "Encrypted message"
        case .redacted: return "Message deleted"
        }
    }

    /// The actions as full-width rows; scrolls only when they do not fit.
    private var panel: some View {
        VStack(spacing: 0) {
            Capsule().fill(Theme.text.opacity(0.2)).frame(width: 38, height: 5).padding(.vertical, 8)
            ViewThatFits(in: .vertical) {
                list
                ScrollView { list }.frame(maxHeight: 380)
            }
        }
        .padding(.bottom, 8)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(Theme.elevated)
                .ignoresSafeArea(edges: .bottom)
        )
    }

    private var list: some View {
        VStack(alignment: .leading, spacing: 0) { actions() }
            .buttonStyle(MessageActionButtonStyle())
            .labelStyle(MessageActionLabelStyle())
    }
}

/// One row of the long-press actions; destructive ones in red.
struct MessageActionButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(configuration.role == .destructive ? Theme.danger : Theme.text)
            .frame(maxWidth: .infinity, minHeight: 46, alignment: .leading)
            .padding(.horizontal, 22)
            .contentShape(Rectangle())
            .background(configuration.isPressed ? Theme.text.opacity(0.06) : Color.clear)
    }
}

struct MessageActionLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 14) {
            configuration.icon
                .font(.system(size: 17))
                .frame(width: 24)
                .opacity(0.75)
            configuration.title.font(.body)
        }
    }
}

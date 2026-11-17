import SwiftUI
import UIKit

/// Push-to-talk in the call screen: a big "Hold to Talk" button above the call bar, and the key of
/// a hardware keyboard (iPad) from Settings > Calls. Logic: Call/PushToTalkLogic.swift.
struct PushToTalkButton: View {
    @ObservedObject var session: CallSession
    /// iPhone in landscape: a lower button, the stage needs the height.
    var compact = false
    @AppStorage(CallPrefs.pushToTalkKeyboardKey) private var keyboardKey = PushToTalkKey.none.rawValue
    @State private var pressing = false

    private var talking: Bool { session.microphoneOn }

    private var text: String {
        if session.deafened && session.pushToTalkHeld { return L("ios.calls.moreDeafenedUndeafenToTalk") }
        if talking { return L("ios.calls.moreTalkingInProgress") }
        return L("ios.calls.moreHoldToTalk")
    }

    private var fill: Color {
        if talking { return Theme.online }
        if session.deafened && session.pushToTalkHeld { return Theme.danger }
        return Theme.elevated
    }

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: talking ? "mic.fill" : "mic.slash.fill")
                .font(.system(size: compact ? 17 : 22, weight: .semibold))
            Text(text)
                .font(compact ? .subheadline.bold() : .headline)
        }
        .foregroundStyle(talking ? Color.white : Theme.text)
        .frame(maxWidth: .infinity)
        .frame(height: compact ? 44 : 64)
        .background(Capsule().fill(fill))
        .scaleEffect(pressing ? 0.97 : 1)
        .animation(.easeOut(duration: 0.12), value: pressing)
        .contentShape(Capsule())
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in
                    guard !pressing else { return }
                    pressing = true
                    session.pushToTalk(.button, down: true)
                }
                .onEnded { _ in
                    pressing = false
                    session.pushToTalk(.button, down: false)
                }
        )
        .background(
            PushToTalkKeyCatcher(key: PushToTalkKey.stored(keyboardKey)) { down in
                session.pushToTalk(.key, down: down)
            }
            .frame(width: 0, height: 0)
        )
        .onDisappear {
            // minimized or left while held: never leave the microphone open
            if pressing {
                pressing = false
                session.pushToTalk(.button, down: false)
            }
            session.pushToTalk(.key, down: false)
        }
        .padding(.horizontal, compact ? 10 : 16)
        .padding(.bottom, compact ? 4 : 8)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L("ios.calls.pushToTalk"))
        .accessibilityValue(talking ? L("ios.calls.moreTalking") : L("ios.calls.moreMicrophoneOff"))
        .accessibilityHint(L("ios.calls.moreHoldToTalkWithVoiceoverDoubleTapToStartAndDoubleTapAgainToSt"))
        .accessibilityAddTraits(.isButton)
        // VoiceOver cannot hold: a double-tap starts, the next one stops
        .accessibilityAction {
            pressing.toggle()
            session.pushToTalk(.button, down: pressing)
        }
    }
}

/// Reads one key of a hardware keyboard while the call screen is shown, with press and release
/// (`pressesBegan` / `pressesEnded`, also for a lone modifier such as Option). Other keys go on
/// through the responder chain.
struct PushToTalkKeyCatcher: UIViewRepresentable {
    let key: PushToTalkKey
    let onChange: (Bool) -> Void

    func makeUIView(context: Context) -> KeyCatcherView {
        let view = KeyCatcherView()
        view.keyCode = key.hidUsage
        view.onChange = onChange
        return view
    }

    func updateUIView(_ view: KeyCatcherView, context: Context) {
        let changed = view.keyCode != key.hidUsage
        if changed, view.isDown {
            view.isDown = false
            onChange(false)
        }
        view.keyCode = key.hidUsage
        view.onChange = onChange
        // only when the key changed: a text field being typed in keeps its focus
        if changed { view.claimFocus() }
    }

    final class KeyCatcherView: UIView {
        var keyCode: Int?
        var onChange: ((Bool) -> Void)?
        var isDown = false

        override var canBecomeFirstResponder: Bool { keyCode != nil }

        override func didMoveToWindow() {
            super.didMoveToWindow()
            claimFocus()
        }

        /// Becomes first responder so key presses reach it, unless a text field is being typed in.
        func claimFocus() {
            guard keyCode != nil, window != nil, !isFirstResponder else { return }
            DispatchQueue.main.async { [weak self] in
                guard let self, self.window != nil, !self.isFirstResponder else { return }
                self.becomeFirstResponder()
            }
        }

        private func matches(_ presses: Set<UIPress>) -> Bool {
            guard let keyCode else { return false }
            return presses.contains { $0.key?.keyCode.rawValue == keyCode }
        }

        override func pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
            guard matches(presses) else { return super.pressesBegan(presses, with: event) }
            if !isDown {
                isDown = true
                onChange?(true)
            }
        }

        override func pressesEnded(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
            guard matches(presses) else { return super.pressesEnded(presses, with: event) }
            release()
        }

        override func pressesCancelled(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
            guard matches(presses) else { return super.pressesCancelled(presses, with: event) }
            release()
        }

        override func resignFirstResponder() -> Bool {
            release()
            return super.resignFirstResponder()
        }

        private func release() {
            guard isDown else { return }
            isDown = false
            onChange?(false)
        }
    }
}

import AppIntents
import Foundation

/// iOS has no global hotkeys, so the desktop's external trigger (`diddy --agent-voice start|stop|toggle`)
/// becomes a Shortcuts action: bind it to the Action Button, Back Tap or an automation. It runs in
/// the app without bringing Diddy to the front, so the app you dictate into keeps the focus.
@MainActor
final class AgentVoiceControl {
    static let shared = AgentVoiceControl()
    /// The call you are in, kept up to date by `CallManager`.
    weak var session: CallSession?
}

enum AgentVoiceAction: String, AppEnum {
    case start, stop, toggle

    static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "Agent Voice")
    static var caseDisplayRepresentations: [AgentVoiceAction: DisplayRepresentation] = [
        .start: "Start",
        .stop: "Stop",
        .toggle: "Toggle",
    ]
}

struct AgentVoiceIntent: AppIntent {
    static var title: LocalizedStringResource = "Mit Agent reden"
    static var description = IntentDescription("Schaltet im Sprachkanal dein Mikrofon stumm und zeigt den anderen, dass du mit einem Agenten redest.")
    static var openAppWhenRun = false

    @Parameter(title: "Action", default: .toggle)
    var action: AgentVoiceAction

    init() {}
    init(action: AgentVoiceAction) { self.action = action }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let session = AgentVoiceControl.shared.session, session.connected else {
            return .result(dialog: "Du bist in keinem Sprachkanal.")
        }
        switch action {
        case .start: await session.setTalkingToAgent(true)
        case .stop: await session.setTalkingToAgent(false)
        case .toggle: await session.setTalkingToAgent(!session.talkingToAgent)
        }
        return .result(dialog: session.talkingToAgent ? "Redet mit Agent." : "Agent beendet.")
    }
}

struct DiddyShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AgentVoiceIntent(action: .toggle),
            phrases: ["Mit Agent reden in \(.applicationName)", "Talk to agent in \(.applicationName)"],
            shortTitle: "Mit Agent reden",
            systemImageName: "waveform"
        )
    }
}

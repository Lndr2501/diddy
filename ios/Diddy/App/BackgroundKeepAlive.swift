import AVFoundation
import os
import UIKit

/// Keeps Diddy running in the background, so sync goes on and new messages can be shown as local
/// notifications.
///
/// A free Apple ID cannot use Apple's push service (its provisioning profile has no
/// `aps-environment`), so nothing can wake a suspended app. iOS does let an app run on while it
/// plays audio (the `audio` background mode, which voice channels already need). This plays
/// silence, mixed with other apps, so music and other sounds carry on as before.
///
/// It costs battery, so it is a setting, and iOS can still end the app (low memory, a restart).
@MainActor
final class BackgroundKeepAlive {
    static let shared = BackgroundKeepAlive()

    private let log = Logger(subsystem: "app.diddy.ios", category: "keepalive")
    private var engine: AVAudioEngine?
    private var observers: [NSObjectProtocol] = []
    private(set) var isRunning = false

    private init() {}

    func setUp() {
        guard observers.isEmpty else { return }
        let center = NotificationCenter.default
        let refresh: (Notification) -> Void = { [weak self] _ in
            Task { @MainActor in self?.refresh() }
        }
        observers = [
            center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main, using: refresh),
            center.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main) { [weak self] _ in
                Task { @MainActor in self?.stop(deactivate: true) }
            },
            // A phone call or Siri pauses the silence; once they are done it has to start again.
            center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
                let ended = (note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt)
                    .flatMap(AVAudioSession.InterruptionType.init(rawValue:)) == .ended
                Task { @MainActor in
                    guard let self, ended else { return }
                    self.stop(deactivate: false)
                    self.refresh()
                }
            },
            center.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: .main) { [weak self] _ in
                Task { @MainActor in
                    guard let self else { return }
                    self.engine = nil
                    self.isRunning = false
                    self.refresh()
                }
            },
        ]
    }

    private var shouldRun: Bool {
        LocalNotifications.isEnabled
            && UIApplication.shared.applicationState != .active
            // A call owns the audio session and keeps the app running by itself.
            && !Sounds.shared.inCall
    }

    /// Starts or stops as the setting, the app state and calls require.
    func refresh() {
        if shouldRun {
            start()
        } else if isRunning {
            stop(deactivate: !Sounds.shared.inCall)
        }
    }

    private func start() {
        guard !isRunning else { return }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try session.setActive(true)

            let engine = AVAudioEngine()
            let player = AVAudioPlayerNode()
            guard let format = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1),
                  let silence = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 44_100),
                  let samples = silence.floatChannelData?[0]
            else { return }
            silence.frameLength = silence.frameCapacity
            samples.update(repeating: 0, count: Int(silence.frameLength))
            engine.attach(player)
            engine.connect(player, to: engine.mainMixerNode, format: format)
            player.scheduleBuffer(silence, at: nil, options: .loops)
            try engine.start()
            player.play()
            self.engine = engine
            isRunning = true
            log.info("running in the background")
        } catch {
            log.error("could not keep running: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// - Parameter deactivate: false when someone else (a call) takes the session over.
    func stop(deactivate: Bool) {
        guard isRunning else { return }
        engine?.stop()
        engine = nil
        isRunning = false
        if deactivate {
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
        log.info("stopped")
    }
}

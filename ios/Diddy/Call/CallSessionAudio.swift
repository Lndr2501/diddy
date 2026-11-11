import AVFoundation
import Foundation
import LiveKit

extension CallSession {
    /// The microphone options of a new call: "Voice processing" in Settings > Calls (echo
    /// cancellation, auto gain and the system's noise suppression). RNNoise is separate.
    static func audioCaptureOptions() -> LiveKit.AudioCaptureOptions {
        let on = CallPrefs.voiceProcessing
        return LiveKit.AudioCaptureOptions(echoCancellation: on, autoGainControl: on, noiseSuppression: on)
    }

    /// Plays everybody at the level you gave them: the volume of a person (0-200 %, 0 when muted
    /// for me) for their voice, the share volume for their screen-share sound, both times the
    /// output volume of the devices menu. Deafened means silence.
    func applyPlaybackVolumes() {
        let master = extras.outputVolume
        for participant in liveKitRoom.remoteParticipants.values {
            let userId = participant.identity.flatMap { Self.split(identity: $0.stringValue)?.userId }
                ?? participant.identity?.stringValue ?? ""
            let voice = deafened ? 0 : extras.voices.playbackLevel(userId) * master
            let stream = deafened ? 0 : extras.streams.playbackLevel(userId) * master
            for publication in participant.audioTracks {
                guard let track = publication.track as? LiveKit.RemoteAudioTrack else { continue }
                track.volume = publication.source == .screenShareAudio ? stream : voice
            }
        }
    }

    // MARK: Input and output devices

    /// The microphones the system offers right now (built-in, headset, Bluetooth, USB).
    static var availableInputs: [AVAudioSessionPortDescription] {
        AVAudioSession.sharedInstance().availableInputs ?? []
    }

    /// The microphone in use.
    static var currentInputUid: String? {
        AVAudioSession.sharedInstance().currentRoute.inputs.first?.uid
    }

    /// Picks a microphone for the call (nil: the system's choice).
    static func selectInput(uid: String?) throws {
        let session = AVAudioSession.sharedInstance()
        guard let uid else {
            try session.setPreferredInput(nil)
            return
        }
        guard let port = session.availableInputs?.first(where: { $0.uid == uid }) else {
            throw DiddyError("This microphone is not available any more.")
        }
        try session.setPreferredInput(port)
    }
}

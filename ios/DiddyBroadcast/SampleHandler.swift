import LiveKit

/// Broadcast upload extension. Started from the screen-share button in a voice channel (or from
/// Control Center); LiveKit's handler forwards every frame and the app's audio to the Diddy app
/// over a socket in the shared app group container (group.app.diddy.ios).
final class SampleHandler: LKSampleHandler, @unchecked Sendable {}

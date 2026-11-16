import SwiftUI

/// What the person is told about sharing the screen from iOS 27 on, where "share screen" sends
/// the whole screen: other apps and Diddy's own settings go out with it.
enum ScreenShareNotice {
    static let title = "Share your whole screen?"
    static let message = "Everyone in the call sees everything on this iPhone, including other apps, notifications and Diddy's settings. Diddy hides your recovery key while you share, but other apps do not."
    static let recoveryLocked = "Hidden while you share your screen. Stop sharing to enter or show your recovery key."
}

extension View {
    /// Asks before the whole screen goes out; `onShare` starts it.
    func wholeScreenShareAlert(isPresented: Binding<Bool>, onShare: @escaping () -> Void) -> some View {
        alert(ScreenShareNotice.title, isPresented: isPresented) {
            Button("Share Screen", role: .destructive, action: onShare)
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(ScreenShareNotice.message)
        }
    }
}

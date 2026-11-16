import SwiftUI

/// What the person is told about sharing the screen from iOS 27 on, where "share screen" sends
/// the whole screen: other apps and Diddy's own settings go out with it.
enum ScreenShareNotice {
    static let title = L("ios.calls.moreShareYourWholeScreen")
    static let message = L("ios.calls.moreEveryoneInTheCallSeesEverythingOnThisIphoneIncludingOtherApp")
    static let recoveryLocked = L("ios.calls.moreHiddenWhileYouShareYourScreenStopSharingToEnterOrShowYourRec")
}

extension View {
    /// Asks before the whole screen goes out; `onShare` starts it.
    func wholeScreenShareAlert(isPresented: Binding<Bool>, onShare: @escaping () -> Void) -> some View {
        alert(ScreenShareNotice.title, isPresented: isPresented) {
            Button(L("ios.calls.shareScreen"), role: .destructive, action: onShare)
            Button(L("settings.deviceTile.cancel"), role: .cancel) {}
        } message: {
            Text(ScreenShareNotice.message)
        }
    }
}

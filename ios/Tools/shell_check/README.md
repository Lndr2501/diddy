# App shell parity checks

Run from `ios/`:

```sh
swiftc -swift-version 5 Diddy/App/ShellLogic.swift Tools/shell_check/main.swift -o /tmp/shell_check
/tmp/shell_check
```

Foundation checks cover status choices, sync transitions, release filtering/version ordering,
Matrix room/event links and via servers, dock persistence/clamping, room navigation and onboarding.
The same command works with Swift 6.1 in Swift 5 mode on Linux.

Integration:

- `ShellViews.swift`: avatar status menu, short status message (the existing 160-character profile
  **bio**, not a new Matrix presence field), sync banner/retry, release notice, Matrix introduction.
- `PluginDockView.swift` and `PluginViews.swift`: local pinned/collapsed cards, height/zoom, compact
  host mode; existing per-plugin CSS and opaque-origin sandbox remain in use.
- `DiddyWelcomeView.swift`: first-run setup, join discovered Diddy Options rooms, profile shortcut,
  later server notice, Settings entry. Light room connections persist per account on this device.
- `ShellJoinRoomView.swift`: room confirmation/join, via servers, existing search-context navigation
  for message links. Preview displays the local room name or address; no remote room preview fetch.
- `MainView.swift`: Command-K, Command-Up/Down, Command-comma and Escape dismissal.
- `SaveImageButton.swift` and `project.yml`: Photos add-only permission and direct save.

SDK calls reuse the exact existing `joinRoomByIdOrAlias(roomIdOrAlias:serverNames:)`, `room.id()`,
`updateDiddyProfile(build:)` and `resume()` signatures. No new SDK API is assumed.

Validation on Linux is **not an Xcode build**. Device checks are required for SwiftUI sheets and
keyboard routing (especially Escape), Photos authorization/save, WKWebView sizing and first-run
presentation, and room-event context navigation on iOS 16. Image save preserves the image currently
displayed, not an original animated file. Update checks are best-effort, once per view lifetime.
The introduction's text matches desktop; onboarding uses native profile settings rather than the
separate desktop mini editor. Discovery uses the existing loaded space hierarchy.

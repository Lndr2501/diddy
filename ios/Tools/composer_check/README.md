Run from `ios/` with Swift 5 or newer:

```sh
swiftc -swift-version 5 Diddy/Matrix/DesktopMarkdown.swift Diddy/Matrix/EmojiData.swift Diddy/Matrix/ComposerLogic.swift Tools/composer_check/main.swift -o /tmp/composer_check
/tmp/composer_check
```

Covers draft persistence and account separation, reply restoration data, UTF-16 formatting,
mention HTML and notification IDs, room links, Markdown disabled/enabled, emoji data and pack
usage overrides, slash parsing, DM conversion and upload limits.

SDK signatures were verified against the generated bindings at the pinned version:
https://github.com/element-hq/matrix-rust-components-swift/blob/26.10.27/Sources/MatrixRustSDK/matrix_sdk_ffi.swift
(`Timeline.sendImage`, `sendVideo`, `sendFile`, `SendAttachmentJoinHandle.cancel/join`,
`UploadParameters`, `VideoInfo`, `FileInfo`, `Room.sendRaw`, content constructors).

The Foundation check cannot validate SwiftUI, UIKit, PhotosUI or SDK integration. An Xcode
build and iOS 16/device checks remain required. Upload progress is indeterminate: the join
handle has cancel/join but no per-upload progress callback. Attachments remain in memory
until sent or removed; large-media memory behavior needs device testing. Custom packs load
on room entry (room, immediate parent spaces, user pack and globally enabled packs).

Slash commands use the current desktop set. `/plain`, `/html`, `/rainbow` and `/lenny` are
not commands in this desktop revision. Bot commands remain ordinary text. Room navigation
following `/join` and `/startdm`, synchronized recent emoji, rich mention pills in the input,
and live pack updates are not implemented. Server moderation and `/delete` use sequential
REST requests; 429 errors are shown instead of silently retrying destructive actions.

Implementation status:

1. Attachments: files, multiple photos/videos, camera images, captions, server size limit,
   cancel and SDK encryption are connected; numeric progress and large-media device validation
   remain open.
2. Paste: images and file URLs received through the editor paste action are queued. Provider
   types beyond UIKit's images/file URLs still need device verification.
3. Drafts: account/room persistence includes token metadata and reply event ID, with a saved-reply
   indicator even when the original event is outside the loaded timeline. Successful sending
   clears the draft; a failed send retains it.
4. Autocomplete: rooms, Unicode and custom emoji are connected; room references send matrix.to
   links, but the editor displays text instead of rich pills. Parent spaces are immediate only.
5. Picker: Unicode categories, custom pack images and sticker sends are connected. Synchronized
   recent emoji are not connected.
6. Commands: desktop command set is connected, including moderation by server and /delete with
   time/type/reason filters. Room navigation after /startdm or /join, group /startdm behavior and
   desktop retry timing remain open.
7. Formatting: toolbar selection, Enter/newline and Markdown flags are connected, including
   edits. Hardware keyboard modifiers and interaction with IME keyboards need iOS testing.

Most sensitive compile/integration points are UIViewRepresentable delegate isolation,
PhotosPicker's iOS 16 presentation overload, SwiftUI type inference in ChatContent, and the
SDK attachment handle/room raw-event paths. No Apple-platform build was available here.

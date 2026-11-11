// Checks for Diddy/Matrix/AvatarChoice.swift. Foundation only, runs on macOS and Linux.
// Run from the ios folder:
//   swiftc Diddy/Matrix/AvatarChoice.swift Tools/avatar_check/main.swift -o /tmp/avatar_check && /tmp/avatar_check
import Foundation

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition { failures += 1; print("FAIL (line \(line)): \(message)") }
}

let room = "mxc://example.org/room"
let person = "mxc://example.org/person"

// usable
check(AvatarChoice.usable(nil) == nil, "nil stays nil")
check(AvatarChoice.usable("") == nil, "empty avatar_url is no picture")
check(AvatarChoice.usable("  \n") == nil, "blank avatar_url is no picture")
check(AvatarChoice.usable(person) == person, "mxc URL is kept")
check(AvatarChoice.usable(" \(person) ") == person, "surrounding blanks are trimmed")

// Direct message: the other person's avatar first, like the desktop.
check(AvatarChoice.room(roomAvatar: nil, isDirect: true, otherPeople: [person]) == person,
      "DM without room avatar shows the partner")
check(AvatarChoice.room(roomAvatar: room, isDirect: true, otherPeople: [person]) == person,
      "DM prefers the partner over the room avatar (desktop order)")
check(AvatarChoice.room(roomAvatar: room, isDirect: true, otherPeople: [nil]) == room,
      "DM partner without picture falls back to the room avatar")
check(AvatarChoice.room(roomAvatar: room, isDirect: true, otherPeople: [""]) == room,
      "DM partner with empty avatar_url falls back to the room avatar")
check(AvatarChoice.room(roomAvatar: nil, isDirect: true, otherPeople: [nil]) == nil,
      "DM without any picture shows initials")
check(AvatarChoice.room(roomAvatar: nil, isDirect: true, otherPeople: []) == nil,
      "DM without heroes shows initials")
check(AvatarChoice.room(roomAvatar: room, isDirect: true, otherPeople: [person, "mxc://example.org/third"]) == room,
      "group DM keeps the room avatar")
check(AvatarChoice.room(roomAvatar: nil, isDirect: true, otherPeople: [person, nil]) == nil,
      "group DM never borrows one member's picture")

// Ordinary rooms never use a member's picture.
check(AvatarChoice.room(roomAvatar: room, isDirect: false, otherPeople: [person]) == room, "room keeps its avatar")
check(AvatarChoice.room(roomAvatar: nil, isDirect: false, otherPeople: [person]) == nil, "room without avatar shows initials")
check(AvatarChoice.room(roomAvatar: "", isDirect: false, otherPeople: []) == nil, "empty room avatar is no picture")

// Retries: a few, growing, then give up.
check(AvatarChoice.retryDelay(afterAttempt: 1) == 2, "first retry after 2 s")
check(AvatarChoice.retryDelay(afterAttempt: 2) == 8, "second retry after 8 s")
check(AvatarChoice.retryDelay(afterAttempt: 3) == nil, "no third retry")
check(AvatarChoice.retryDelay(afterAttempt: 0) == nil, "attempt numbers start at 1")

if failures > 0 {
    print("\(failures) avatar check(s) failed")
    exit(1)
}
print("avatar checks passed")

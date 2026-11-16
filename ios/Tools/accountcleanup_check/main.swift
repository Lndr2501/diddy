// Checks for Diddy/Matrix/AccountCleanupLogic.swift: which leftover account folders and Keychain
// items are deleted at start, and when a logout counts as done.
// Run from the ios folder:
//   swiftc Diddy/Matrix/AccountCleanupLogic.swift Tools/accountcleanup_check/main.swift -o /tmp/accountcleanup_check && /tmp/accountcleanup_check
import Foundation

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition { failures += 1; print("FAIL (line \(line)): \(message)") }
}

let listed = "0f8fad5b-d9cb-469f-a165-70867728950e"
let orphan = "7c9e6679-7425-40de-944b-e07fc1f90ae7"
let loggingIn = "16fd2706-8baf-433b-82eb-8c7fada847da"

// MARK: Account ids

check(AccountCleanupLogic.isAccountId(listed), "a lowercased UUID is an account id")
check(!AccountCleanupLogic.isAccountId(listed.uppercased()), "an uppercased UUID was not made by Diddy")
check(!AccountCleanupLogic.isAccountId(""), "empty name")
check(!AccountCleanupLogic.isAccountId(".DS_Store"), "system file")
check(!AccountCleanupLogic.isAccountId("@me:example.org"), "a user id is not an account id")
check(!AccountCleanupLogic.isAccountId("../\(listed)"), "no path tricks")
check(!AccountCleanupLogic.isAccountId("\(listed) "), "trailing space")

// MARK: Orphans

check(
    AccountCleanupLogic.orphans(found: [listed, orphan], listed: [listed], inProgress: []) == [orphan],
    "only the unlisted account is an orphan"
)
check(
    AccountCleanupLogic.orphans(found: [listed], listed: [listed], inProgress: []).isEmpty,
    "a listed account is never an orphan"
)
check(
    AccountCleanupLogic.orphans(found: [loggingIn], listed: [], inProgress: [loggingIn]).isEmpty,
    "a login that is running is never an orphan"
)
check(
    AccountCleanupLogic.orphans(found: [orphan, orphan, listed], listed: [listed], inProgress: [loggingIn]) == [orphan],
    "repeats (folder and Keychain item) come once"
)
check(
    AccountCleanupLogic.orphans(found: ["Shared", ".DS_Store", orphan.uppercased()], listed: [], inProgress: []).isEmpty,
    "names Diddy did not make stay"
)
check(
    AccountCleanupLogic.orphans(found: [orphan, loggingIn], listed: [], inProgress: []) == [loggingIn, orphan].sorted(),
    "with an empty list every account id is an orphan, sorted"
)

// MARK: Logout

check(AccountCleanupLogic.sessionAlreadyEnded(errcode: "M_UNKNOWN_TOKEN"), "an ended session counts as logged out")
check(!AccountCleanupLogic.sessionAlreadyEnded(errcode: "M_FORBIDDEN"), "a refusal is a failure")
check(!AccountCleanupLogic.sessionAlreadyEnded(errcode: "M_UNKNOWN"), "a server error is a failure")
check(!AccountCleanupLogic.sessionAlreadyEnded(errcode: nil), "no answer is a failure")

check(AccountCleanupLogic.sessionAlreadyEnded(errorText: "MatrixApi(kind: unknownToken(softLogout: false), code: \"M_UNKNOWN_TOKEN\")"), "SDK text with the code")
check(AccountCleanupLogic.sessionAlreadyEnded(errorText: "unknownToken(softLogout: true)"), "SDK text with the kind only")
check(!AccountCleanupLogic.sessionAlreadyEnded(errorText: "Network error: timed out"), "a network failure is a failure")
check(!AccountCleanupLogic.sessionAlreadyEnded(errorText: ""), "empty text")

if failures > 0 {
    print("\(failures) check(s) failed")
    exit(1)
}
print("account cleanup checks passed")

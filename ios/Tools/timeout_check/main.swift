// Checks for Diddy/Matrix/HomeserverTimeout.swift: the sign-in requests give up after the desktop's
// 8 s even if the request ignores cancellation, and results and errors pass through unchanged.
// Foundation only, runs on macOS and Linux. Run from the ios folder:
//   swiftc -swift-version 5 Diddy/Matrix/HomeserverTimeout.swift Tools/timeout_check/main.swift -o /tmp/timeout_check && /tmp/timeout_check
import Dispatch
import Foundation

var failures = 0
func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if !condition { failures += 1; print("FAIL (line \(line)): \(message)") }
}

struct Boom: Error {}

let finished = DispatchSemaphore(value: 0)

Task {
    check(HomeserverTimeout.seconds == 8, "the limit is desktop's 8 s")

    // A result passes through.
    do {
        let value = try await HomeserverTimeout.run(seconds: 2) { 42 }
        check(value == 42, "the result is passed on")
    } catch {
        check(false, "a quick operation must not fail: \(error)")
    }

    // An error of the operation passes through, and is not a timeout.
    do {
        _ = try await HomeserverTimeout.run(seconds: 2) { () async throws -> Int in throw Boom() }
        check(false, "the error must be thrown")
    } catch {
        check(error is Boom, "the operation's error is passed on")
        check(!(error is HomeserverTimeout.TimedOut), "an operation error is not a timeout")
    }

    // An operation that ignores cancellation (blocks for 1.5 s) gives up after 0.2 s.
    let start = Date()
    do {
        _ = try await HomeserverTimeout.run(seconds: 0.2) { () async throws -> Int in
            // Blocks like a request that ignores cancellation (a semaphore that never fires).
            _ = DispatchSemaphore(value: 0).wait(timeout: .now() + 1.5)
            return 1
        }
        check(false, "a slow operation must time out")
    } catch {
        let elapsed = Date().timeIntervalSince(start)
        check(error is HomeserverTimeout.TimedOut, "the timeout error is TimedOut, got \(error)")
        check(elapsed < 1.0, "the caller stops waiting at the limit (took \(elapsed) s)")
    }

    let message = HomeserverTimeout.TimedOut().errorDescription ?? ""
    check(!message.isEmpty, "the timeout has a message for the login screen")

    if failures == 0 {
        print("timeout_check: all checks passed")
    } else {
        print("timeout_check: \(failures) check(s) failed")
    }
    finished.signal()
}

finished.wait()
exit(failures == 0 ? 0 : 1)

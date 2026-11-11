import Foundation

// A bound for the homeserver requests of sign-in, like desktop's `withHomeserverTimeout`
// (cinny/src/app/utils/requestTimeout.ts, 8 s, used by cs-api.ts for discovery and versions).
// Foundation only, so Tools/timeout_check tests it on macOS and Linux.
//
// The bound is on the waiting: when the time is up the caller gets `TimedOut` at once, even if the
// request ignores cancellation, and the request is cancelled as far as it can be. Its late result
// is dropped. Diddy's sync and the login itself are not bounded (desktop does not bound them).

enum HomeserverTimeout {
    /// Desktop's limit.
    static let seconds: TimeInterval = 8

    struct TimedOut: LocalizedError {
        var errorDescription: String? {
            "The homeserver did not respond in time. Check the address and your connection, then try again."
        }
    }

    /// Runs `operation` and gives up after `seconds`. Errors of the operation are passed on.
    static func run<T>(
        seconds: TimeInterval = HomeserverTimeout.seconds,
        _ operation: @escaping () async throws -> T
    ) async throws -> T {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<T, Error>) in
            let gate = Gate<T>(continuation)
            let work = Task {
                do {
                    let value = try await operation()
                    gate.succeed(value)
                } catch {
                    gate.fail(error)
                }
            }
            Task {
                try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
                // Only when the operation has not finished yet.
                if gate.fail(TimedOut()) { work.cancel() }
            }
        }
    }

    /// Resumes the continuation once: whichever of the operation and the timer comes first.
    private final class Gate<T>: @unchecked Sendable {
        private let lock = NSLock()
        private var continuation: CheckedContinuation<T, Error>?

        init(_ continuation: CheckedContinuation<T, Error>) {
            self.continuation = continuation
        }

        private func take() -> CheckedContinuation<T, Error>? {
            lock.lock()
            defer { lock.unlock() }
            let pending = continuation
            continuation = nil
            return pending
        }

        func succeed(_ value: T) {
            take()?.resume(returning: value)
        }

        /// Returns whether this call was the one that resumed it.
        @discardableResult
        func fail(_ error: Error) -> Bool {
            guard let pending = take() else { return false }
            pending.resume(throwing: error)
            return true
        }
    }
}

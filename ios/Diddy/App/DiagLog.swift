import Foundation
import MetricKit
import OSLog
import UIKit

/// The app's log file, like `diag.rs` on the desktop: one plain text file of technical events
/// (start, calls, connection problems, crashes), rotated at 2 MB (`app.log` and `app.log.old`) in
/// Library/Logs/Diddy. Settings > About Diddy > Export Diagnostics shares it for a bug report.
///
/// It never contains message texts or keys, only technical events; lines are cut at 600 characters.
/// Crashes come from MetricKit, which hands the report over on the next start (iOS keeps it).
final class DiagLog: NSObject, @unchecked Sendable {
    static let shared = DiagLog()

    private static let maxLine = 600
    private static let maxBytes: UInt64 = 2 * 1024 * 1024
    private static let keptCrashReports = 5

    private let queue = DispatchQueue(label: "app.diddy.ios.diag")
    let directory: URL
    private var file: URL { directory.appendingPathComponent("app.log") }
    private var oldFile: URL { directory.appendingPathComponent("app.log.old") }
    private var crashDirectory: URL { directory.appendingPathComponent("crashes", isDirectory: true) }

    private override init() {
        let library = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        directory = library.appendingPathComponent("Logs/Diddy", isDirectory: true)
        super.init()
    }

    /// Called once at start: a header line, uncaught Objective-C exceptions, MetricKit crash reports.
    func setUp() {
        write("---- Diddy \(Self.appVersion) started (\(Self.systemDescription)) ----")
        NSSetUncaughtExceptionHandler { exception in
            // The process is about to die: write synchronously, the queue would never run.
            DiagLog.shared.appendNow("EXCEPTION \(exception.name.rawValue): \(exception.reason ?? "(no reason)")")
        }
        MXMetricManager.shared.add(self)
        // Reports iOS delivered while Diddy was not subscribed yet (MetricKit keeps them for us).
        receive(MXMetricManager.shared.pastDiagnosticPayloads)
    }

    /// Appends one line (newlines removed, length limited) with a Unix timestamp.
    func write(_ line: String) {
        queue.async { self.appendNow(line) }
    }

    private func appendNow(_ line: String) {
        let manager = FileManager.default
        try? manager.createDirectory(at: directory, withIntermediateDirectories: true)
        // Start over instead of growing forever.
        if let size = (try? manager.attributesOfItem(atPath: file.path))?[.size] as? UInt64, size > Self.maxBytes {
            try? manager.removeItem(at: oldFile)
            try? manager.moveItem(at: file, to: oldFile)
        }
        let text = String(line.components(separatedBy: .newlines).joined(separator: " ").prefix(Self.maxLine))
        let stamped = String(format: "%.3f ", Date().timeIntervalSince1970) + text + "\n"
        guard let data = stamped.data(using: .utf8) else { return }
        if let handle = try? FileHandle(forWritingTo: file) {
            defer { try? handle.close() }
            _ = try? handle.seekToEnd()
            try? handle.write(contentsOf: data)
        } else {
            try? data.write(to: file)
        }
    }

    // MARK: Export

    /// One text file with everything a bug report needs: device, version, the log file, crash
    /// reports, and this run's system log lines of Diddy. Written to the temporary folder.
    func export() async -> URL {
        await Task.detached(priority: .utility) { self.buildExport() }.value
    }

    private func buildExport() -> URL {
        let systemLog = Self.recentSystemLog()
        return queue.sync {
            let manager = FileManager.default
            var parts: [String] = [
                "Diddy diagnostics",
                "Version: \(Self.appVersion)",
                "System: \(Self.systemDescription)",
                "Exported: \(ISO8601DateFormatter().string(from: Date()))",
                "",
            ]
            for (title, url) in [("app.log.old", oldFile), ("app.log", file)] {
                guard let text = try? String(contentsOf: url, encoding: .utf8) else { continue }
                parts.append("==== \(title) ====")
                parts.append(text)
            }
            let crashes = ((try? manager.contentsOfDirectory(at: crashDirectory, includingPropertiesForKeys: nil)) ?? [])
                .sorted { $0.lastPathComponent < $1.lastPathComponent }
            for crash in crashes {
                guard let text = try? String(contentsOf: crash, encoding: .utf8) else { continue }
                parts.append("==== crash report \(crash.lastPathComponent) ====")
                parts.append(text)
            }
            parts.append("==== system log (this run) ====")
            parts.append(systemLog)

            let stamp = ISO8601DateFormatter().string(from: Date())
                .replacingOccurrences(of: ":", with: "-")
            let url = manager.temporaryDirectory.appendingPathComponent("Diddy-diagnostics-\(stamp).txt")
            try? parts.joined(separator: "\n").write(to: url, atomically: true, encoding: .utf8)
            return url
        }
    }

    /// Diddy's own `Logger` lines of the running process (iOS gives an app nothing older).
    private static func recentSystemLog() -> String {
        do {
            let store = try OSLogStore(scope: .currentProcessIdentifier)
            let since = store.position(date: Date().addingTimeInterval(-6 * 60 * 60))
            let formatter = ISO8601DateFormatter()
            var lines: [String] = []
            for case let entry as OSLogEntryLog in try store.getEntries(at: since)
            where entry.subsystem == "app.diddy.ios" {
                lines.append("\(formatter.string(from: entry.date)) [\(entry.category)] \(entry.composedMessage)")
            }
            return lines.suffix(2000).joined(separator: "\n")
        } catch {
            return "(not available: \(error.localizedDescription))"
        }
    }

    // MARK: Crash reports

    private static let lastCrashKey = "diagLastCrashReport"

    private func receive(_ payloads: [MXDiagnosticPayload]) {
        // Past payloads come again on every start; log each report once.
        let seen = UserDefaults.standard.double(forKey: Self.lastCrashKey)
        var newest = seen
        for payload in payloads where payload.timeStampEnd.timeIntervalSince1970 > seen {
            newest = max(newest, payload.timeStampEnd.timeIntervalSince1970)
            for crash in payload.crashDiagnostics ?? [] {
                let reason = [
                    crash.exceptionType.map { "exception \($0)" },
                    crash.signal.map { "signal \($0)" },
                    crash.terminationReason,
                ].compactMap { $0 }.joined(separator: ", ")
                write("CRASH (version \(crash.metaData.applicationBuildVersion)) at \(payload.timeStampEnd): \(reason)")
                saveCrash(crash.jsonRepresentation(), date: payload.timeStampEnd)
            }
        }
        if newest > seen { UserDefaults.standard.set(newest, forKey: Self.lastCrashKey) }
    }

    private func saveCrash(_ json: Data, date: Date) {
        queue.async {
            let manager = FileManager.default
            try? manager.createDirectory(at: self.crashDirectory, withIntermediateDirectories: true)
            let name = String(format: "%.0f.json", date.timeIntervalSince1970)
            try? json.write(to: self.crashDirectory.appendingPathComponent(name))
            // Keep only the newest few.
            let all = ((try? manager.contentsOfDirectory(at: self.crashDirectory, includingPropertiesForKeys: nil)) ?? [])
                .sorted { $0.lastPathComponent > $1.lastPathComponent }
            for old in all.dropFirst(Self.keptCrashReports) { try? manager.removeItem(at: old) }
        }
    }

    // MARK: Device

    static var appVersion: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "?"
        let build = info?["CFBundleVersion"] as? String ?? "?"
        return "\(short) (\(build))"
    }

    private static var systemDescription: String {
        var info = utsname()
        uname(&info)
        let model = withUnsafeBytes(of: &info.machine) { raw in
            String(decoding: raw.prefix { $0 != 0 }, as: UTF8.self)
        }
        return "iOS \(ProcessInfo.processInfo.operatingSystemVersionString), \(model)"
    }
}

extension DiagLog: MXMetricManagerSubscriber {
    func didReceive(_ payloads: [MXDiagnosticPayload]) {
        receive(payloads)
    }
}

import Foundation

/// Export and import of the profile customization as a file (#157), the same format as desktop's
/// `profileTransfer.ts`; "Reset to default" and the Diddy version that is shown on the card
/// (`clientVersion.ts`). Foundation only, see `Tools/profiletransfer_check`.
///
/// Only the look and the texts are carried: name style, card, nameplate, effect, frame, bio, facts,
/// interests, links, activity and card layout. Never the chosen status (that is per account and per
/// moment) and never the Diddy version. Pictures stay references (mxc://) to the media on the server
/// they were uploaded to. An imported file is untrusted: it goes through the same whitelists as
/// profiles from the sync and only fills the editor; nothing is saved until the user presses Save.
enum DiddyProfileTransfer {
    static let fileKind = "diddy-profile-customization"
    static let fileName = "diddy-profile.json"
    /// An exported profile is a few kilobytes; anything much bigger is not one.
    static let maxFileBytes = 256 * 1024

    /// The parts a file carries (desktop's `EDITOR_KEYS`).
    static let portableParts: [DiddyProfileDraft.Part] = DiddyProfileDraft.Part.allCases.filter { $0 != .status && $0 != .shownBadges }

    // MARK: Export

    /// The profile object of a file: `v` and every part that is set, without status and version.
    /// `stored` is your stored profile; only an own effect or frame that is kept as it is needs it.
    static func profileObject(_ draft: DiddyProfileDraft, stored: [String: Any]) -> [String: Any] {
        var profile: [String: Any] = ["v": 1]
        for part in portableParts {
            let old: Any? = (part == .effect || part == .frame) ? stored[part.rawValue] : nil
            if let value = draft.value(of: part, old: old) { profile[part.rawValue] = value }
        }
        return profile
    }

    /// The text of the file for `draft`.
    static func export(_ draft: DiddyProfileDraft, stored: [String: Any]) -> String {
        let file: [String: Any] = ["kind": fileKind, "v": 1, "profile": profileObject(draft, stored: stored)]
        guard JSONSerialization.isValidJSONObject(file),
              let data = try? JSONSerialization.data(withJSONObject: file, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])
        else { return "{}" }
        return String(decoding: data, as: UTF8.self)
    }

    // MARK: Import

    enum ImportResult: Equatable {
        case imported(DiddyProfileDraft)
        case failed(String)
    }

    /// Reads a file's text back into a draft; never throws. The draft has the default status and no
    /// badges: the editor keeps your own.
    static func importProfile(_ text: String) -> ImportResult {
        if text.utf8.count > maxFileBytes { return .failed("This file is too big to be a Diddy profile.") }
        guard let raw = try? JSONSerialization.jsonObject(with: Data(text.utf8), options: [.fragmentsAllowed]) else {
            return .failed("This is not a Diddy profile file (not valid JSON).")
        }
        // the wrapper written by `export`, or a bare profile object ({ "v": 1, ... })
        var candidate: Any? = raw
        if let file = raw as? [String: Any], file["kind"] as? String == fileKind { candidate = file["profile"] }
        guard let profile = candidate as? [String: Any], DiddySanitize.number(profile["v"]) == 1 else {
            return .failed("This is not a Diddy profile file.")
        }
        var draft = DiddyProfileDraft(raw: profile)
        draft.status = "online"
        draft.shownBadges = []
        // An own effect or frame travels with its pictures: kept as the checked value.
        if draft.effect == .custom, let effect = DiddyProfileEffect(profile["effect"]), let choice = DiddyProfileRules.ownChoice(effectValue(effect)) {
            draft.effect = choice
        }
        if draft.frame == .custom, let frame = DiddyProfileFrame(profile["frame"]), let choice = DiddyProfileRules.ownChoice(frameValue(frame)) {
            draft.frame = choice
        }
        let empty = DiddyProfileDraft()
        if draft.changedParts(from: empty).filter({ portableParts.contains($0) }).isEmpty {
            return .failed("The file contains no profile settings.")
        }
        return .imported(draft)
    }

    /// The `effect` value of an own effect (layers with their timing), as checked by the reader.
    static func effectValue(_ effect: DiddyProfileEffect) -> [String: Any] {
        let layers: [[String: Any]] = effect.layers.map { layer in
            [
                "mxc": layer.mxc,
                "start": DiddyProfileRules.jsonNumber(layer.start), "duration": DiddyProfileRules.jsonNumber(layer.duration),
                "loop": layer.loop, "loopDelay": DiddyProfileRules.jsonNumber(layer.loopDelay),
                "x": DiddyProfileRules.jsonNumber(layer.x), "y": DiddyProfileRules.jsonNumber(layer.y),
                "w": DiddyProfileRules.jsonNumber(layer.w), "h": DiddyProfileRules.jsonNumber(layer.h),
                "z": DiddyProfileRules.jsonNumber(layer.z),
            ]
        }
        var out: [String: Any] = ["layers": layers]
        if let still = effect.stillMxc { out["stillMxc"] = still }
        if let preview = effect.previewMxc { out["previewMxc"] = preview }
        if let name = effect.name { out["name"] = name }
        return out
    }

    /// The `frame` value of an own frame (layers and geometry), as checked by the reader.
    static func frameValue(_ frame: DiddyProfileFrame) -> [String: Any] {
        let geometry = DiddyProfileFrame.clamped(frame.geometry)
        var out: [String: Any] = [
            "innerWidth": DiddyProfileRules.jsonNumber(geometry.innerWidth),
            "overflowTop": DiddyProfileRules.jsonNumber(geometry.overflowTop),
            "overflowBottom": DiddyProfileRules.jsonNumber(geometry.overflowBottom),
            "overflowHorizontal": DiddyProfileRules.jsonNumber(geometry.overflowHorizontal),
            "layers": frame.layers.map { ["mxc": $0.mxc, "order": $0.order, "anchor": $0.anchor] as [String: Any] },
        ]
        if let name = frame.name { out["name"] = name }
        return out
    }

    // MARK: Reset

    /// "Reset to default": every part of the editor back to nothing (status online), the badges you
    /// show stay (desktop saves those from its badge list).
    static func reset(_ draft: DiddyProfileDraft) -> DiddyProfileDraft {
        var fresh = DiddyProfileDraft()
        fresh.shownBadges = draft.shownBadges
        return fresh
    }

    /// Whether "Reset to default" would change anything.
    static func canReset(_ draft: DiddyProfileDraft) -> Bool {
        !draft.changedParts(from: DiddyProfileDraft()).filter { $0 != .shownBadges }.isEmpty
    }

    // MARK: Diddy version (clientVersion.ts)

    /// The profile as this client writes it: with `version` when you share it, without the field
    /// otherwise. A version that is not safe to show is left out.
    static func stampVersion(_ profile: [String: Any], version: String?, share: Bool) -> [String: Any] {
        var out = profile
        out.removeValue(forKey: "clientVersion")
        if share, let safe = DiddySanitize.version(version) { out["clientVersion"] = safe }
        return out
    }
}

/// The Diddy version this app writes into your profile, and the switch that turns it off
/// ("Show my Diddy version", `state/versionShare.ts`: on by default, kept on this device).
enum DiddyClientVersion {
    private static let key = "diddyShareVersion"

    /// `1.6.0`, from the app's Info.plist.
    static var current: String? { DiddySanitize.version(Bundle.main.infoDictionary?["CFBundleShortVersionString"]) }

    static var shares: Bool {
        get { UserDefaults.standard.object(forKey: key) as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: key) }
    }
}

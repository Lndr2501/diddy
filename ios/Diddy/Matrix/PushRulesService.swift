import Foundation

/// The push rule and pusher calls behind Settings > Notifications, made like desktop
/// (`mx.setPushRuleActions`, `addPushRule`, `deletePushRule`, `setPusher`). The rules are the
/// account's, so a change here shows on desktop too, and the other way round.
///
/// The SDK's `NotificationSettings` only knows "all messages / mentions / mute" per room kind, not
/// desktop's Sound / Silent / Off per rule, keywords as content rules or email pushers, so the
/// client-server API is used directly.
extension MatrixAccount {
    /// `GET /pushrules/`: the whole rule set, `{"global": {"override": [...], ...}}`.
    func pushRules() async throws -> [String: Any] {
        try await clientRequest("/_matrix/client/v3/pushrules/", method: "GET")
    }

    func setPushRuleActions(kind: String, ruleId: String, actions: [Any]) async throws {
        _ = try await clientRequest(PushRuleLogic.path(kind: kind, ruleId: ruleId) + "/actions", body: ["actions": actions], method: "PUT")
    }

    /// Desktop adds a keyword as a content rule named like the keyword, Silent with highlight.
    func addNotificationKeyword(_ keyword: String) async throws {
        _ = try await clientRequest(PushRuleLogic.path(kind: "content", ruleId: keyword), body: PushRuleLogic.keywordBody(keyword), method: "PUT")
    }

    func deletePushRule(kind: String, ruleId: String) async throws {
        _ = try await clientRequest(PushRuleLogic.path(kind: kind, ruleId: ruleId), method: "DELETE")
    }

    /// Your email addresses and whether one of them gets notifications.
    func emailNotificationState() async throws -> PushRuleLogic.EmailState {
        let threepids = try await clientRequest("/_matrix/client/v3/account/3pid", method: "GET")["threepids"] as? [[String: Any]] ?? []
        let pushers = try await clientRequest("/_matrix/client/v3/pushers", method: "GET")["pushers"] as? [[String: Any]] ?? []
        return PushRuleLogic.emailState(threepids: threepids, pushers: pushers)
    }

    func setEmailNotifications(email: String, enabled: Bool) async throws {
        _ = try await clientRequest("/_matrix/client/v3/pushers/set", body: PushRuleLogic.emailPusherBody(email: email, enable: enabled), method: "POST")
    }
}

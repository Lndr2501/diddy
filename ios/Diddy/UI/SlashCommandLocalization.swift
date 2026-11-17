import Foundation

// Keep the Foundation-only command descriptions unchanged for the standalone composer checks.
// The suggestions shown in the iOS composer resolve the same copy from the shared locale files.
extension SlashCommand {
    var localizedDescription: String {
        switch self {
        case .me: return L("ios.slashHints.action")
        case .notice: return L("ios.slashHints.notice")
        case .shrug: return L("ios.slashHints.sendSymbol", ["symbol": Self.shrugText])
        case .tableflip: return L("ios.slashHints.sendSymbol", ["symbol": Self.tableflipText])
        case .unflip: return L("ios.slashHints.sendSymbol", ["symbol": Self.unflipText])
        case .startdm: return L("ios.slashHints.startDm")
        case .join: return L("ios.slashHints.join")
        case .leave: return L("ios.slashHints.leave")
        case .invite: return L("ios.slashHints.invite")
        case .disinvite: return L("ios.slashHints.disinvite")
        case .kick: return L("ios.slashHints.kick")
        case .ban: return L("ios.slashHints.ban")
        case .unban: return L("ios.slashHints.unban")
        case .ignore: return L("ios.slashHints.ignore")
        case .unignore: return L("ios.slashHints.unignore")
        case .myroomnick: return L("ios.slashHints.myroomnick")
        case .myroomavatar: return L("ios.slashHints.myroomavatar")
        case .converttodm: return L("ios.slashHints.convertToDm")
        case .converttoroom: return L("ios.slashHints.convertToRoom")
        case .delete: return L("ios.slashHints.delete")
        case .acl: return L("ios.slashHints.acl")
        }
    }
}

extension ComposerFormat {
    var localizedTitle: String {
        switch self {
        case .bold: return L("composer.toolbar.bold")
        case .italic: return L("composer.toolbar.italic")
        case .underline: return L("composer.toolbar.underline")
        case .strike: return L("composer.toolbar.strikeThrough")
        case .code: return L("composer.toolbar.inlineCode")
        case .spoiler: return L("composer.toolbar.spoiler")
        case .quote: return L("composer.toolbar.blockQuote")
        case .codeBlock: return L("composer.toolbar.blockCode")
        case .orderedList: return L("composer.toolbar.orderedList")
        case .unorderedList: return L("composer.toolbar.unorderedList")
        case .heading: return L("ios.toolbarExtra.heading")
        case .link: return L("ios.toolbarExtra.link")
        }
    }
}

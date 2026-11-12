// Plain-text preview of a replied-to message (reply quote, reply draft) (#184).
//
// These previews show the event's plain `body`. Older Diddy iOS builds (and some bots) put mentions
// into the body as Markdown links, `[Lndr](https://matrix.to/#/@lndr:example.org)`. The message
// itself renders from `formatted_body` and looks fine, but the quote showed the raw link. Here a
// Markdown link to matrix.to keeps only its label; other links and text stay as they are.

const MATRIX_TO_LINK = /\[([^\]\n]{1,256})\]\(https:\/\/matrix\.to\/#\/[^)\s]{1,512}\)/g;

/** Drops the reply fallback (`> <@user> …` lines) at the start of a body, like `trimReplyFromBody`. */
export const trimReplyFallback = (body: string): string => {
  const match = body.match(/^> <.+?> .+\n(>.*\n)*?\n/m);
  if (!match) return body;
  return body.slice(match[0].length);
};

/** Replaces Markdown links to matrix.to with their label. */
export const unwrapMatrixToLinks = (text: string): string =>
  text.replace(MATRIX_TO_LINK, (_whole, label: string) => label);

/** The text a reply quote or reply draft shows for a message body. */
export const replyPreviewText = (body: string): string =>
  unwrapMatrixToLinks(trimReplyFallback(body));

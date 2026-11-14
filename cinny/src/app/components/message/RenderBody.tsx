import React, { memo, useMemo } from 'react';
import parse, { HTMLReactParserOptions } from 'html-react-parser';
import Linkify from 'linkify-react';
import { Opts } from 'linkifyjs';
import { sanitizeCustomHtml } from '../../utils/sanitize';
import { highlightText, scaleSystemEmoji } from '../../plugins/react-custom-html-parser';

type RenderBodyProps = {
  body: string;
  customBody?: string;

  highlightRegex?: RegExp;
  htmlReactParserOptions: HTMLReactParserOptions;
  linkifyOpts: Opts;
};

/**
 * The text of a message. Parsing the HTML into React elements is costly and the timeline renders
 * every visible message again when anything changes, so the parsed tree is kept until the body or
 * the parser options change.
 */
export const RenderBody = memo(
  ({ body, customBody, highlightRegex, htmlReactParserOptions, linkifyOpts }: RenderBodyProps) => {
    const html = useMemo(
      () => (customBody ? parse(sanitizeCustomHtml(customBody), htmlReactParserOptions) : undefined),
      [customBody, htmlReactParserOptions]
    );
    const plain = useMemo(
      () =>
        customBody ? undefined : (
          <Linkify options={linkifyOpts}>
            {highlightRegex
              ? highlightText(highlightRegex, scaleSystemEmoji(body))
              : scaleSystemEmoji(body)}
          </Linkify>
        ),
      [customBody, body, highlightRegex, linkifyOpts]
    );
    return html ?? plain ?? null;
  }
);

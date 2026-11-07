import { Box, Icon, Icons, Text, as, color, toRem } from 'folds';
import { EventTimelineSet, Room } from 'matrix-js-sdk';
import React, { MouseEventHandler, ReactNode, useCallback, useMemo } from 'react';
import classNames from 'classnames';
import { getMemberAvatarMxc, getMemberDisplayName, trimReplyFromBody } from '../../utils/room';
import { getMxIdLocalPart, mxcUrlToHttp } from '../../utils/matrix';
import { UserAvatar } from '../user-avatar';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { LinePlaceholder } from './placeholder';
import { randomNumberBetween } from '../../utils/common';
import * as css from './Reply.css';
import { MessageBadEncryptedContent, MessageDeletedContent, MessageFailedContent } from './content';
import { scaleSystemEmoji } from '../../plugins/react-custom-html-parser';
import { useRoomEvent } from '../../hooks/useRoomEvent';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import colorMXID from '../../../util/colorMXID';
import { GetMemberPowerTag } from '../../hooks/useMemberPowerTag';
import { DiddyName } from '../diddy/DiddyName';

type ReplyLayoutProps = {
  userColor?: string;
  username?: ReactNode;
  compact?: boolean;
};
export const ReplyLayout = as<'div', ReplyLayoutProps>(
  ({ username, userColor, compact, className, children, ...props }, ref) => (
    <Box
      className={classNames(css.Reply, compact && css.ReplyCompact, className)}
      alignItems="Center"
      gap={compact ? '200' : '100'}
      {...props}
      ref={ref}
    >
      <Box style={{ color: userColor, maxWidth: toRem(200) }} alignItems="Center" shrink="No">
        {!compact && <Icon size="100" src={Icons.ReplyArrow} />}
        {username}
      </Box>
      <Box grow="Yes" className={css.ReplyContent}>
        {children}
      </Box>
    </Box>
  )
);

export const ThreadIndicator = as<'div'>(({ ...props }, ref) => (
  <Box
    shrink="No"
    className={css.ThreadIndicator}
    alignItems="Center"
    gap="100"
    {...props}
    ref={ref}
  >
    <Icon size="50" src={Icons.Thread} />
    <Text size="L400">Thread</Text>
  </Box>
));

type ReplyProps = {
  room: Room;
  timelineSet?: EventTimelineSet | undefined;
  replyEventId: string;
  threadRootId?: string | undefined;
  replier?: string | undefined,
  onClick?: MouseEventHandler | undefined;
  getMemberPowerTag?: GetMemberPowerTag;
  accessibleTagColors?: Map<string, string>;
  legacyUsernameColor?: boolean;
};

export const Reply = as<'div', ReplyProps>(
  (
    {
      room,
      timelineSet,
      replyEventId,
      threadRootId,
      replier,
      onClick,
      getMemberPowerTag,
      accessibleTagColors,
      legacyUsernameColor,
      className,
      ...props
    },
    ref
  ) => {
    const placeholderWidth = useMemo(() => randomNumberBetween(40, 400), []);
    const getFromLocalTimeline = useCallback(
      () => timelineSet?.findEventById(replyEventId),
      [timelineSet, replyEventId]
    );
    const replyEvent = useRoomEvent(room, replyEventId, getFromLocalTimeline);

    const { body } = replyEvent?.getContent() ?? {};
    const sender = replyEvent?.getSender();
    const powerTag = sender ? getMemberPowerTag?.(sender) : undefined;
    const tagColor = powerTag?.color ? accessibleTagColors?.get(powerTag.color) : undefined;

    const usernameColor = legacyUsernameColor ? colorMXID(sender ?? replyEventId) : tagColor;

    const mx = useMatrixClient();
    const useAuthentication = useMediaAuthentication();
    const senderAvatarMxc = sender ? getMemberAvatarMxc(room, sender) : undefined;
    const senderAvatarUrl = senderAvatarMxc
      ? mxcUrlToHttp(mx, senderAvatarMxc, useAuthentication, 32, 32, 'crop') ?? undefined
      : undefined;

    const fallbackBody = replyEvent?.isRedacted() ? (
      <MessageDeletedContent />
    ) : (
      <MessageFailedContent />
    );

    const badEncryption = replyEvent?.getContent().msgtype === 'm.bad.encrypted';
    const bodyJSX = body ? scaleSystemEmoji(trimReplyFromBody(body)) : fallbackBody;

    return (
      <Box
        direction="Row"
        gap="200"
        alignItems="Center"
        {...props}
        className={classNames(css.ReplyRoot, className)}
        ref={ref}
        data-reply-highlight={mx.getUserId() === sender && sender !== replier}
      >
        {threadRootId && (
          <ThreadIndicator as="button" data-event-id={threadRootId} onClick={onClick} />
        )}
        <ReplyLayout
          as="button"
          compact
          userColor={usernameColor}
          username={
            sender && (
              <Box alignItems="Center" gap="100">
                <span className={css.ReplyAvatar}>
                  <UserAvatar surface="chat"
                    userId={sender}
                    src={senderAvatarUrl}
                    alt=""
                    renderFallback={() => <span />}
                  />
                </span>
                <Text size="T200" truncate>
                  <b>
                    @
                    <DiddyName
                      userId={sender}
                      name={getMemberDisplayName(room, sender) ?? getMxIdLocalPart(sender) ?? sender}
                    />
                  </b>
                </Text>
              </Box>
            )
          }
          data-event-id={replyEventId}
          onClick={onClick}
        >
          {replyEvent !== undefined ? (
            <Text size="T200" truncate>
              {badEncryption ? <MessageBadEncryptedContent /> : bodyJSX}
            </Text>
          ) : (
            <LinePlaceholder
              style={{
                backgroundColor: color.SurfaceVariant.ContainerActive,
                width: toRem(placeholderWidth),
                maxWidth: '100%',
              }}
            />
          )}
        </ReplyLayout>
      </Box>
    );
  }
);

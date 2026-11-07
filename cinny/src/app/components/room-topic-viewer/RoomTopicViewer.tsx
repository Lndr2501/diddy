import React from 'react';
import { as, Box, Modal, Scroll, Text } from 'folds';
import classNames from 'classnames';
import Linkify from 'linkify-react';
import * as css from './style.css';
import { LINKIFY_OPTS, scaleSystemEmoji } from '../../plugins/react-custom-html-parser';
import * as sheetCss from '../sheet/Sheet.css';
import { SheetHeader } from '../sheet';

export const RoomTopicViewer = as<
  'div',
  {
    name: string;
    topic: string;
    requestClose: () => void;
  }
>(({ name, topic, requestClose, className, ...props }, ref) => (
  <Modal
    size="300"
    flexHeight
    className={classNames(sheetCss.Sheet, css.ModalFlex, className)}
    {...props}
    ref={ref}
  >
    <SheetHeader title={name} onClose={requestClose} />
    <Scroll className={css.ModalScroll} size="300" hideTrack>
      <Box className={css.ModalContent} direction="Column" gap="100">
        <Text size="T300" className={css.ModalTopic} priority="400">
          <Linkify options={LINKIFY_OPTS}>{scaleSystemEmoji(topic)}</Linkify>
        </Text>
      </Box>
    </Scroll>
  </Modal>
));

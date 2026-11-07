/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
import React from 'react';
import FileSaver from 'file-saver';
import classNames from 'classnames';
import { Box, Chip, Icon, IconButton, Icons, Text, as } from 'folds';
import * as css from './ImageViewer.css';
import { useZoom } from '../../hooks/useZoom';
import { usePan } from '../../hooks/usePan';
import { downloadMedia } from '../../utils/matrix';

export type ImageViewerProps = {
  alt: string;
  src: string;
  requestClose: () => void;
};

export const ImageViewer = as<'div', ImageViewerProps>(
  ({ className, alt, src, requestClose, ...props }, ref) => {
    const { zoom, zoomIn, zoomOut, setZoom } = useZoom(0.2);
    const { pan, cursor, onMouseDown } = usePan(zoom !== 1);

    const handleDownload = async () => {
      const fileContent = await downloadMedia(src);
      FileSaver.saveAs(fileContent, alt);
    };

    return (
      <Box
        className={classNames(css.ImageViewer, className)}
        direction="Column"
        {...props}
        ref={ref}
      >
        <div className={css.ImageViewerHeader}>
          <IconButton
            className={classNames(css.Control, css.CloseControl)}
            size="300"
            radii="Pill"
            onClick={requestClose}
            aria-label="Close"
          >
            <Icon size="50" src={Icons.Cross} />
          </IconButton>
          <Text className={css.ImageViewerTitle} size="T300" truncate>
            {alt}
          </Text>
        </div>
        <Box
          grow="Yes"
          className={css.ImageViewerContent}
          justifyContent="Center"
          alignItems="Center"
        >
          <img
            className={css.ImageViewerImg}
            style={{
              cursor,
              transform: `scale(${zoom}) translate(${pan.translateX}px, ${pan.translateY}px)`,
            }}
            src={src}
            alt={alt}
            onMouseDown={onMouseDown}
          />
        </Box>
        <div className={css.ControlPill}>
          <IconButton
            className={css.Control}
            size="300"
            radii="Pill"
            onClick={zoomOut}
            aria-label="Zoom Out"
            data-active={zoom < 1}
          >
            <Icon size="50" src={Icons.Minus} />
          </IconButton>
          <Chip
            className={classNames(css.Control, css.ZoomLabel)}
            radii="Pill"
            onClick={() => setZoom(zoom === 1 ? 2 : 1)}
            aria-label="Toggle Zoom"
          >
            <Text size="B300">{Math.round(zoom * 100)}%</Text>
          </Chip>
          <IconButton
            className={css.Control}
            size="300"
            radii="Pill"
            onClick={zoomIn}
            aria-label="Zoom In"
            data-active={zoom > 1}
          >
            <Icon size="50" src={Icons.Plus} />
          </IconButton>
          <span className={css.ControlSeparator} aria-hidden />
          <IconButton
            className={css.Control}
            size="300"
            radii="Pill"
            onClick={handleDownload}
            aria-label="Download"
            title="Download"
          >
            <Icon size="50" src={Icons.Download} />
          </IconButton>
        </div>
      </Box>
    );
  }
);

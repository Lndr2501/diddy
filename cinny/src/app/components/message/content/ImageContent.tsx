import React, { ReactNode, useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Chip,
  Icon,
  Icons,
  Spinner,
  Text,
  Tooltip,
  TooltipProvider,
  as,
} from 'folds';
import classNames from 'classnames';
import { useSetAtom } from 'jotai';
import { BlurhashCanvas } from 'react-blurhash';
import { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import { imageViewerAtom } from '../../../state/imageViewer';
import {
  IImageInfo,
  IThumbnailContent,
  MATRIX_BLUR_HASH_PROPERTY_NAME,
} from '../../../../types/matrix/common';
import { AsyncStatus, useAsyncCallback, ignoreRejection } from '../../../hooks/useAsyncCallback';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import * as css from './style.css';
import { bytesToSize } from '../../../utils/common';
import { FALLBACK_MIMETYPE } from '../../../utils/mimeTypes';
import { decryptFile, downloadEncryptedMedia, mxcUrlToHttp } from '../../../utils/matrix';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { validBlurHash } from '../../../utils/blurHash';
import { cachedObjectUrl } from '../../../utils/mediaCache';

type RenderViewerProps = {
  src: string;
  alt: string;
  requestClose: () => void;
};
type RenderImageProps = {
  alt: string;
  title: string;
  src: string;
  onLoad: () => void;
  onError: () => void;
  onClick: () => void;
  tabIndex: number;
};
export type ImageContentProps = {
  body: string;
  mimeType?: string;
  url: string;
  info?: IImageInfo & IThumbnailContent;
  encInfo?: EncryptedAttachmentInfo;
  autoPlay?: boolean;
  markedAsSpoiler?: boolean;
  spoilerReason?: string;
  renderViewer: (props: RenderViewerProps) => ReactNode;
  renderImage: (props: RenderImageProps) => ReactNode;
};
export const ImageContent = as<'div', ImageContentProps>(
  (
    {
      className,
      body,
      mimeType,
      url,
      info,
      encInfo,
      autoPlay,
      markedAsSpoiler,
      spoilerReason,
      // the viewer is rendered once at the app root (ImageViewerHost)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      renderViewer: _renderViewer,
      renderImage,
      ...props
    },
    ref
  ) => {
    const mx = useMatrixClient();
    const useAuthentication = useMediaAuthentication();
    const blurHash = validBlurHash(info?.[MATRIX_BLUR_HASH_PROPERTY_NAME]);

    const [load, setLoad] = useState(false);
    const [error, setError] = useState(false);
    const setViewerImage = useSetAtom(imageViewerAtom);
    const [blurred, setBlurred] = useState(markedAsSpoiler ?? false);

    // Encrypted pictures: the chat shows the sender's thumbnail (much smaller), the viewer the
    // original. GIFs keep the original, a thumbnail would stand still.
    const thumbFile = info?.thumbnail_file;
    const useThumb =
      !!encInfo && !!thumbFile?.url && !(mimeType ?? '').toLowerCase().includes('gif');
    const loadOriginal = useCallback(async () => {
      const mediaUrl = mxcUrlToHttp(mx, url, useAuthentication);
      if (!mediaUrl) throw new Error('Invalid media URL');
      if (!encInfo) return mediaUrl;
      return cachedObjectUrl(url, () =>
        downloadEncryptedMedia(mediaUrl, (encBuf) =>
          decryptFile(encBuf, mimeType ?? FALLBACK_MIMETYPE, encInfo)
        )
      );
    }, [mx, url, useAuthentication, mimeType, encInfo]);
    const openViewer = useCallback(
      (shown: string) => {
        if (!useThumb) {
          setViewerImage({ src: shown, alt: body });
          return;
        }
        loadOriginal()
          .then((original) => setViewerImage({ src: original, alt: body }))
          .catch(() => setViewerImage({ src: shown, alt: body }));
      },
      [useThumb, loadOriginal, setViewerImage, body]
    );

    const [srcState, loadSrc] = useAsyncCallback(
      useCallback(async () => {
        if (useThumb && thumbFile) {
          const thumbUrl = mxcUrlToHttp(mx, thumbFile.url, useAuthentication);
          if (thumbUrl) {
            try {
              return await cachedObjectUrl(thumbFile.url, () =>
                downloadEncryptedMedia(thumbUrl, (encBuf) =>
                  decryptFile(encBuf, info?.thumbnail_info?.mimetype ?? FALLBACK_MIMETYPE, thumbFile)
                )
              );
            } catch {
              // a broken thumbnail: the original below
            }
          }
        }
        const mediaUrl = mxcUrlToHttp(mx, url, useAuthentication);
        if (!mediaUrl) throw new Error('Invalid media URL');
        if (encInfo) {
          return cachedObjectUrl(url, () =>
            downloadEncryptedMedia(mediaUrl, (encBuf) =>
              decryptFile(encBuf, mimeType ?? FALLBACK_MIMETYPE, encInfo)
            )
          );
        }
        return mediaUrl;
      }, [mx, url, useAuthentication, mimeType, encInfo, useThumb, thumbFile, info])
    );

    const handleLoad = () => {
      setLoad(true);
    };
    const handleError = () => {
      setLoad(false);
      setError(true);
    };

    const handleRetry = () => {
      setError(false);
      loadSrc();
    };

    useEffect(() => {
      if (autoPlay) loadSrc();
    }, [autoPlay, loadSrc]);

    return (
      <Box className={classNames(css.RelativeBase, className)} {...props} ref={ref}>
        {typeof blurHash === 'string' && !load && (
          <BlurhashCanvas
            style={{ width: '100%', height: '100%' }}
            width={32}
            height={32}
            hash={blurHash}
            punch={1}
          />
        )}
        {!autoPlay && !markedAsSpoiler && srcState.status === AsyncStatus.Idle && (
          <Box className={css.AbsoluteContainer} alignItems="Center" justifyContent="Center">
            <Button
              variant="Secondary"
              fill="Solid"
              radii="300"
              size="300"
              onClick={ignoreRejection(loadSrc)}
              before={<Icon size="Inherit" src={Icons.Photo} filled />}
            >
              <Text size="B300">View</Text>
            </Button>
          </Box>
        )}
        {srcState.status === AsyncStatus.Success && (
          <Box className={classNames(css.AbsoluteContainer, blurred && css.Blur)}>
            {renderImage({
              alt: body,
              title: body,
              src: srcState.data,
              onLoad: handleLoad,
              onError: handleError,
              onClick: () => openViewer(srcState.data),
              tabIndex: 0,
            })}
          </Box>
        )}
        {blurred && !error && srcState.status !== AsyncStatus.Error && (
          <Box className={css.AbsoluteContainer} alignItems="Center" justifyContent="Center">
            <TooltipProvider
              tooltip={
                typeof spoilerReason === 'string' && (
                  <Tooltip variant="Secondary">
                    <Text>{spoilerReason}</Text>
                  </Tooltip>
                )
              }
              position="Top"
              align="Center"
            >
              {(triggerRef) => (
                <Chip
                  ref={triggerRef}
                  variant="Secondary"
                  radii="Pill"
                  size="500"
                  outlined
                  onClick={() => {
                    setBlurred(false);
                    if (srcState.status === AsyncStatus.Idle) {
                      loadSrc();
                    }
                  }}
                >
                  <Text size="B300">Spoiler</Text>
                </Chip>
              )}
            </TooltipProvider>
          </Box>
        )}
        {(srcState.status === AsyncStatus.Loading || srcState.status === AsyncStatus.Success) &&
          !load &&
          !blurred && (
            <Box className={css.AbsoluteContainer} alignItems="Center" justifyContent="Center">
              <Spinner variant="Secondary" />
            </Box>
          )}
        {(error || srcState.status === AsyncStatus.Error) && (
          <Box className={css.AbsoluteContainer} alignItems="Center" justifyContent="Center">
            <TooltipProvider
              tooltip={
                <Tooltip variant="Critical">
                  <Text>Failed to load image!</Text>
                </Tooltip>
              }
              position="Top"
              align="Center"
            >
              {(triggerRef) => (
                <Button
                  ref={triggerRef}
                  size="300"
                  variant="Critical"
                  fill="Soft"
                  outlined
                  radii="300"
                  onClick={handleRetry}
                  before={<Icon size="Inherit" src={Icons.Warning} filled />}
                >
                  <Text size="B300">Retry</Text>
                </Button>
              )}
            </TooltipProvider>
          </Box>
        )}
        {!load && typeof info?.size === 'number' && (
          <Box className={css.AbsoluteFooter} justifyContent="End" alignContent="Center" gap="200">
            <Badge variant="Secondary" fill="Soft">
              <Text size="L400">{bytesToSize(info.size)}</Text>
            </Badge>
          </Box>
        )}
      </Box>
    );
  }
);

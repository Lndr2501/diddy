import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Icon, IconButton, Icons, Scroll, Spinner, Text, as, color, config } from 'folds';
import { ImageOverlay } from '../ImageOverlay';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { UrlPreview, UrlPreviewContent, UrlPreviewDescription, UrlPreviewImg } from './UrlPreview';
import {
  getIntersectionObserverEntry,
  useIntersectionObserver,
} from '../../hooks/useIntersectionObserver';
import * as css from './UrlPreviewCard.css';
import * as previewCss from './UrlPreview.css';
import { tryDecodeURIComponent } from '../../utils/dom';
import { mxcUrlToHttp } from '../../utils/matrix';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { ImageViewer } from '../image-viewer';
import { onEnterOrSpace } from '../../utils/keyboard';
import { useOptionalRoom } from '../../hooks/useRoom';
import { LinkMeta, displayHost, isImageLink, metaFromServer } from '../../plugins/linkEmbeds';
import { canFetchLinks, fetchLinkMeta } from '../../plugins/linkEmbedFetch';

const linkStyles = { color: color.Success.Main };

/** A link straight to a picture shows the picture (#198). It is hidden when it does not load. */
const LinkImage = as<'div', { url: string }>(({ url, ...props }, ref) => {
  const [viewer, setViewer] = useState(false);
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <div {...props} ref={ref}>
      <img
        className={previewCss.LinkImage}
        src={url}
        alt={tryDecodeURIComponent(url)}
        loading="lazy"
        referrerPolicy="no-referrer"
        tabIndex={0}
        onError={() => setFailed(true)}
        onClick={() => setViewer(true)}
        onKeyDown={(evt: React.KeyboardEvent<HTMLElement>) => onEnterOrSpace(() => setViewer(true))(evt)}
      />
      <ImageOverlay
        src={url}
        alt={tryDecodeURIComponent(url)}
        viewer={viewer}
        requestClose={() => setViewer(false)}
        renderViewer={(p) => <ImageViewer {...p} />}
      />
    </div>
  );
});

/**
 * The card's data: the homeserver's preview in unencrypted rooms, the app's own reading of the page
 * in encrypted rooms (the link must not reach the server there) and whenever the server has
 * nothing (#197).
 */
const useLinkMeta = (url: string, ts: number) => {
  const mx = useMatrixClient();
  const room = useOptionalRoom();
  const encrypted = room?.hasEncryptionStateEvent() ?? false;
  return useAsyncCallback(
    useCallback(async (): Promise<LinkMeta | undefined> => {
      if (!encrypted) {
        try {
          const fromServer = metaFromServer(
            (await mx.getUrlPreview(url, ts)) as unknown as Record<string, unknown>
          );
          if (fromServer) return fromServer;
        } catch {
          // The server has no previews or could not read the page: try it here.
        }
      }
      if (!canFetchLinks()) return undefined;
      return fetchLinkMeta(url);
    }, [mx, url, ts, encrypted])
  );
};

const LinkCard = as<'div', { url: string; ts: number }>(({ url, ts, style, ...props }, ref) => {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const [viewer, setViewer] = useState(false);
  const [previewStatus, loadPreview] = useLinkMeta(url, ts);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  if (previewStatus.status === AsyncStatus.Error) return null;
  if (previewStatus.status === AsyncStatus.Success && !previewStatus.data) return null;

  const renderContent = (meta: LinkMeta) => {
    const fromServer = meta.image?.startsWith('mxc://');
    const imgUrl = fromServer ? mxcUrlToHttp(mx, meta.image ?? '', useAuthentication) : meta.image;
    const shownImg = fromServer
      ? mxcUrlToHttp(mx, meta.image ?? '', useAuthentication, 800, 600, 'scale', false)
      : meta.image;

    return (
      <>
        <UrlPreviewContent>
          <Text size="T200" priority="300" truncate>
            {meta.siteName ?? displayHost(url)}
          </Text>
          {meta.title && (
            <Text
              style={linkStyles}
              as="a"
              href={url}
              target="_blank"
              rel="noreferrer"
              priority="400"
              className={previewCss.LinkTitle}
            >
              <b>{meta.title}</b>
            </Text>
          )}
          {meta.description && (
            <Text size="T200" priority="300">
              <UrlPreviewDescription>{meta.description}</UrlPreviewDescription>
            </Text>
          )}
          {!meta.title && (
            <Text style={linkStyles} truncate as="a" href={url} target="_blank" rel="noreferrer" size="T200">
              {tryDecodeURIComponent(url)}
            </Text>
          )}
        </UrlPreviewContent>
        {shownImg && (
          <UrlPreviewImg
            src={shownImg}
            alt={meta.title}
            title={meta.title}
            loading="lazy"
            referrerPolicy="no-referrer"
            tabIndex={0}
            onError={(evt: React.SyntheticEvent<HTMLImageElement>) => {
              // eslint-disable-next-line no-param-reassign
              evt.currentTarget.style.display = 'none';
            }}
            onKeyDown={(evt: React.KeyboardEvent<HTMLElement>) =>
              onEnterOrSpace(() => setViewer(true))(evt)
            }
            onClick={() => setViewer(true)}
          />
        )}
        {imgUrl && (
          <ImageOverlay
            src={imgUrl}
            alt={meta.title ?? ''}
            viewer={viewer}
            requestClose={() => {
              setViewer(false);
            }}
            renderViewer={(p) => <ImageViewer {...p} />}
          />
        )}
      </>
    );
  };

  const accent =
    previewStatus.status === AsyncStatus.Success ? previewStatus.data?.color : undefined;
  return (
    <UrlPreview
      {...props}
      style={accent ? { ...style, borderLeftColor: accent } : style}
      ref={ref}
    >
      {previewStatus.status === AsyncStatus.Success && previewStatus.data ? (
        renderContent(previewStatus.data)
      ) : (
        <Box grow="Yes" alignItems="Center" justifyContent="Center" style={{ minHeight: 80 }}>
          <Spinner variant="Secondary" size="400" />
        </Box>
      )}
    </UrlPreview>
  );
});

/** What shows under a message for one link: the picture itself or a card (#197, #198). */
export const UrlPreviewCard = as<'div', { url: string; ts: number }>(({ url, ts, ...props }, ref) =>
  isImageLink(url) ? (
    <LinkImage url={url} {...props} ref={ref} />
  ) : (
    <LinkCard url={url} ts={ts} {...props} ref={ref} />
  )
);

export const UrlPreviewHolder = as<'div'>(({ children, ...props }, ref) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const backAnchorRef = useRef<HTMLDivElement>(null);
  const frontAnchorRef = useRef<HTMLDivElement>(null);
  const [backVisible, setBackVisible] = useState(true);
  const [frontVisible, setFrontVisible] = useState(true);

  const intersectionObserver = useIntersectionObserver(
    useCallback((entries) => {
      const backAnchor = backAnchorRef.current;
      const frontAnchor = frontAnchorRef.current;
      const backEntry = backAnchor && getIntersectionObserverEntry(backAnchor, entries);
      const frontEntry = frontAnchor && getIntersectionObserverEntry(frontAnchor, entries);
      if (backEntry) {
        setBackVisible(backEntry.isIntersecting);
      }
      if (frontEntry) {
        setFrontVisible(frontEntry.isIntersecting);
      }
    }, []),
    useCallback(
      () => ({
        root: scrollRef.current,
        rootMargin: '10px',
      }),
      []
    )
  );

  useEffect(() => {
    const backAnchor = backAnchorRef.current;
    const frontAnchor = frontAnchorRef.current;
    if (backAnchor) intersectionObserver?.observe(backAnchor);
    if (frontAnchor) intersectionObserver?.observe(frontAnchor);
    return () => {
      if (backAnchor) intersectionObserver?.unobserve(backAnchor);
      if (frontAnchor) intersectionObserver?.unobserve(frontAnchor);
    };
  }, [intersectionObserver]);

  const handleScrollBack = () => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const { offsetWidth, scrollLeft } = scroll;
    scroll.scrollTo({
      left: scrollLeft - offsetWidth / 1.3,
      behavior: 'smooth',
    });
  };
  const handleScrollFront = () => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const { offsetWidth, scrollLeft } = scroll;
    scroll.scrollTo({
      left: scrollLeft + offsetWidth / 1.3,
      behavior: 'smooth',
    });
  };

  return (
    <Box
      direction="Column"
      {...props}
      ref={ref}
      style={{ marginTop: config.space.S200, position: 'relative' }}
    >
      <Scroll ref={scrollRef} direction="Horizontal" size="0" visibility="Hover" hideTrack>
        <Box shrink="No" alignItems="Start">
          <div ref={backAnchorRef} />
          {!backVisible && (
            <>
              <div className={css.UrlPreviewHolderGradient({ position: 'Left' })} />
              <IconButton
                className={css.UrlPreviewHolderBtn({ position: 'Left' })}
                variant="Secondary"
                radii="Pill"
                size="300"
                outlined
                onClick={handleScrollBack}
              >
                <Icon size="300" src={Icons.ArrowLeft} />
              </IconButton>
            </>
          )}
          <Box alignItems="Inherit" gap="200">
            {children}

            {!frontVisible && (
              <>
                <div className={css.UrlPreviewHolderGradient({ position: 'Right' })} />
                <IconButton
                  className={css.UrlPreviewHolderBtn({ position: 'Right' })}
                  variant="Primary"
                  radii="Pill"
                  size="300"
                  outlined
                  onClick={handleScrollFront}
                >
                  <Icon size="300" src={Icons.ArrowRight} />
                </IconButton>
              </>
            )}
            <div ref={frontAnchorRef} />
          </Box>
        </Box>
      </Scroll>
    </Box>
  );
});

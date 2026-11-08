import React, { ChangeEventHandler, useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  color,
  Icon,
  Icons,
  Input,
  Scroll,
  Spinner,
  Text,
  toRem,
  config,
} from 'folds';
import {
  fetchGifPage,
  getGifProvider,
  GifProviderId,
  GifResult,
  GifSearchError,
} from '../../plugins/gifSearch';
import { activeGifKey, getGifCustomerId, useGifPrefs } from '../../state/gifPrefs';
import { useDebounce } from '../../hooks/useDebounce';
import { mobileOrTablet } from '../../utils/user-agent';
import { preventScrollWithArrowKey } from '../../utils/keyboard';
import * as css from './components/styles.css';

const PREVIEW_HEIGHT = 100;

const reducedMotionQuery = (): MediaQueryList | undefined =>
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : undefined;

function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(() => reducedMotionQuery()?.matches ?? false);
  useEffect(() => {
    const query = reducedMotionQuery();
    if (!query) return undefined;
    const onChange = () => setReduce(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduce;
}

type GifTileProps = {
  gif: GifResult;
  still: boolean;
  sending: boolean;
  disabled: boolean;
  onClick: (gif: GifResult) => void;
};
function GifTile({ gif, still, sending, disabled, onClick }: GifTileProps) {
  // with reduced motion the still frame is shown and only moves while hovered or focused
  const [active, setActive] = useState(false);
  const width = Math.round((gif.previewWidth * PREVIEW_HEIGHT) / gif.previewHeight);
  const src = still && gif.stillUrl && !active ? gif.stillUrl : gif.previewUrl;

  return (
    <button
      type="button"
      className={css.GifItem}
      style={{ flexGrow: width, flexBasis: toRem(width), width: toRem(width) }}
      title={gif.title || 'GIF'}
      aria-label={`Send GIF${gif.title ? `: ${gif.title}` : ''}`}
      disabled={disabled}
      onClick={() => onClick(gif)}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
    >
      <img
        className={css.GifImg}
        src={src}
        alt={gif.title || 'GIF'}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        draggable={false}
      />
      {sending && (
        <span className={css.GifItemOverlay}>
          <Spinner size="300" variant="Secondary" />
        </span>
      )}
    </button>
  );
}

function GifSetupHint() {
  return (
    <Box
      grow="Yes"
      direction="Column"
      alignItems="Center"
      justifyContent="Center"
      gap="300"
      style={{ padding: `${toRem(48)} ${config.space.S500}` }}
    >
      <Icon size="600" src={Icons.Photo} />
      <Box direction="Column" gap="100">
        <Text align="Center">GIF search is not set up</Text>
        <Text priority="300" align="Center" size="T200">
          Add your own GIPHY or KLIPY API key in Settings &gt; General &gt; GIFs.
        </Text>
      </Box>
    </Box>
  );
}

type GifPanelProps = {
  onSelect: (provider: GifProviderId, gif: GifResult) => Promise<void>;
  requestClose: () => void;
};

export function GifPanel({ onSelect, requestClose }: GifPanelProps) {
  const prefs = useGifPrefs();
  const apiKey = activeGifKey(prefs);
  const provider = getGifProvider(prefs.provider);
  const reduceMotion = useReducedMotion();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GifResult[]>([]);
  const [next, setNext] = useState<number>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [sendingId, setSendingId] = useState<string>();
  const abortRef = useRef<AbortController>();
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(
    async (term: string, cursor: number | undefined, append: boolean) => {
      if (!apiKey) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(undefined);
      try {
        const page = await fetchGifPage(
          provider,
          {
            apiKey,
            rating: prefs.rating,
            query: term,
            cursor,
            customerId: provider.id === 'klipy' ? getGifCustomerId() : undefined,
          },
          (url, init) => fetch(url, init),
          controller.signal
        );
        if (controller.signal.aborted) return;
        setResults((prev) => {
          if (!append) return page.results;
          const seen = new Set(prev.map((g) => g.id));
          return [...prev, ...page.results.filter((g) => !seen.has(g.id))];
        });
        setNext(page.next);
        if (!append) scrollRef.current?.scrollTo({ top: 0 });
      } catch (e) {
        if (controller.signal.aborted) return;
        setError(e instanceof GifSearchError ? e.message : 'GIFs could not be loaded.');
        if (!append) setResults([]);
        setNext(undefined);
      } finally {
        if (abortRef.current === controller) setLoading(false);
      }
    },
    [apiKey, provider, prefs.rating]
  );

  // trending on open and whenever the source, key or rating changes
  useEffect(() => {
    setQuery('');
    load('', undefined, false);
    return () => abortRef.current?.abort();
  }, [load]);

  const debouncedSearch = useDebounce(
    useCallback((term: string) => load(term, undefined, false), [load]),
    { wait: 400 }
  );

  const handleChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    setQuery(evt.target.value);
    debouncedSearch(evt.target.value);
  };

  const handleSelect = async (gif: GifResult) => {
    if (sendingId) return;
    setSendingId(gif.id);
    setError(undefined);
    try {
      await onSelect(provider.id, gif);
      requestClose();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'The GIF could not be sent.');
    } finally {
      setSendingId(undefined);
    }
  };

  if (!apiKey) return <GifSetupHint />;

  return (
    <Box direction="Column" grow="Yes" style={{ minHeight: 0 }}>
      <Box shrink="No" style={{ padding: `${config.space.S200} ${config.space.S300} 0` }}>
        <Input
          style={{ width: '100%' }}
          variant="SurfaceVariant"
          size="400"
          placeholder={provider.searchPlaceholder}
          aria-label={provider.searchPlaceholder}
          maxLength={50}
          value={query}
          onChange={handleChange}
          after={
            loading ? (
              <Spinner size="100" variant="Secondary" />
            ) : (
              <Icon src={Icons.Search} size="50" />
            )
          }
          autoFocus={!mobileOrTablet()}
        />
      </Box>
      {error && (
        <Text
          size="T200"
          role="alert"
          style={{
            padding: `${config.space.S200} ${config.space.S300} 0`,
            color: color.Critical.Main,
          }}
        >
          {error}
        </Text>
      )}
      <Box grow="Yes" style={{ minHeight: 0 }}>
        <Scroll ref={scrollRef} size="400" onKeyDown={preventScrollWithArrowKey} hideTrack>
          <div className={css.GifGrid}>
            {results.map((gif) => (
              <GifTile
                key={gif.id}
                gif={gif}
                still={reduceMotion}
                sending={sendingId === gif.id}
                disabled={!!sendingId}
                onClick={handleSelect}
              />
            ))}
          </div>
          {!loading && !error && results.length === 0 && (
            <Text priority="300" align="Center" size="T200" style={{ padding: config.space.S400 }}>
              No GIFs found
            </Text>
          )}
          {next !== undefined && results.length > 0 && (
            <Box justifyContent="Center" style={{ padding: config.space.S200 }}>
              <Button
                size="300"
                variant="Secondary"
                fill="Soft"
                radii="300"
                disabled={loading}
                onClick={() => load(query, next, true)}
              >
                <Text size="B300">More</Text>
              </Button>
            </Box>
          )}
        </Scroll>
      </Box>
      <Text className={css.GifFooter} size="T200" align="Center">
        {provider.attribution}
      </Text>
    </Box>
  );
}

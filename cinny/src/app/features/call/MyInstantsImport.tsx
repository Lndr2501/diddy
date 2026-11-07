import React, { useCallback, useRef, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  color,
  config,
  Dialog,
  Header,
  Icon,
  IconButton,
  Icons,
  Input,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Spinner,
  Text,
  toRem,
} from 'folds';
import { soundboard } from '../../plugins/call';
import {
  downloadMyInstant,
  fetchInstantPage,
  MyInstant,
  parseInput,
  searchMyInstants,
} from '../../plugins/myinstants';

const MAX_PAGES_FOR_ALL = 15;
const PAUSE_MS = 150;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

type MyInstantsImportProps = {
  onClose: () => void;
};

export function MyInstantsImport({ onClose }: MyInstantsImportProps) {
  const [input, setInput] = useState('');
  const [results, setResults] = useState<MyInstant[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [term, setTerm] = useState<string>();
  const [nextPage, setNextPage] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>();
  const [error, setError] = useState<string>();
  const cancelRef = useRef(false);

  const reset = () => {
    setResults([]);
    setSelected(new Set());
    setTerm(undefined);
    setNextPage(undefined);
    setStatus(undefined);
    setError(undefined);
  };

  const handleSearch = async () => {
    const target = parseInput(input);
    reset();
    if (!target) {
      setError('Enter a search term or a MyInstants link.');
      return;
    }
    setBusy(true);
    try {
      if (target.kind === 'instant') {
        const item = await fetchInstantPage(target.url);
        if (!item) throw new Error('No sound found on that page.');
        setResults([item]);
        setSelected(new Set([item.path]));
        return;
      }
      const page = await searchMyInstants(target.name, target.page);
      setTerm(target.name);
      setResults(page.items);
      setNextPage(page.hasNext ? target.page + 1 : undefined);
      if (page.items.length === 0) setStatus('Nothing found.');
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const loadMore = async () => {
    if (!term || !nextPage) return;
    setBusy(true);
    setError(undefined);
    try {
      const page = await searchMyInstants(term, nextPage);
      setResults((prev) => {
        const known = new Set(prev.map((r) => r.path));
        return [...prev, ...page.items.filter((i) => !known.has(i.path))];
      });
      setNextPage(page.hasNext ? nextPage + 1 : undefined);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (path: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const handlePreview = async (item: MyInstant) => {
    setError(undefined);
    try {
      await soundboard.preview(await downloadMyInstant(item));
    } catch (e) {
      setError(`Preview failed: ${messageOf(e)}`);
    }
  };

  const importItems = useCallback(async (items: MyInstant[]) => {
    cancelRef.current = false;
    let added = 0;
    let existing = 0;
    let failed = 0;
    for (let i = 0; i < items.length; i += 1) {
      if (cancelRef.current) break;
      setStatus(`Importing ${i + 1} of ${items.length} …`);
      try {
        // eslint-disable-next-line no-await-in-loop
        const bytes = await downloadMyInstant(items[i]);
        // eslint-disable-next-line no-await-in-loop
        const isNew = await soundboard.addClipFromBytes(items[i].name, bytes);
        if (isNew) added += 1;
        else existing += 1;
      } catch {
        failed += 1;
      }
      // eslint-disable-next-line no-await-in-loop
      await wait(PAUSE_MS);
    }
    const parts = [`${added} added`];
    if (existing) parts.push(`${existing} already there`);
    if (failed) parts.push(`${failed} failed (too long or not loadable)`);
    setStatus(`${cancelRef.current ? 'Stopped: ' : 'Done: '}${parts.join(', ')}.`);
  }, []);

  const handleImportSelected = async () => {
    setBusy(true);
    setError(undefined);
    await importItems(results.filter((r) => selected.has(r.path)));
    setBusy(false);
  };

  const handleImportAll = async () => {
    setBusy(true);
    setError(undefined);
    cancelRef.current = false;
    let all = results;
    let page = nextPage;
    try {
      // Load the remaining result pages first.
      for (let n = 0; term && page && n < MAX_PAGES_FOR_ALL && !cancelRef.current; n += 1) {
        setStatus(`Loading results … (${all.length})`);
        // eslint-disable-next-line no-await-in-loop
        const next = await searchMyInstants(term, page);
        const known = new Set(all.map((r) => r.path));
        all = [...all, ...next.items.filter((i) => !known.has(i.path))];
        page = next.hasNext ? page + 1 : undefined;
        // eslint-disable-next-line no-await-in-loop
        await wait(PAUSE_MS);
      }
      setResults(all);
      setNextPage(page);
      await importItems(all);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => {
    cancelRef.current = true;
    onClose();
  };

  const allSelected = results.length > 0 && selected.size === results.length;

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <Dialog variant="Surface" style={{ width: toRem(460), maxWidth: '96vw' }}>
          <Header
            style={{
              padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
              borderBottomWidth: config.borderWidth.B300,
            }}
            variant="Surface"
            size="500"
          >
            <Box grow="Yes">
              <Text size="H4">Import from MyInstants</Text>
            </Box>
            <IconButton size="300" onClick={handleClose} radii="300" aria-label="Close">
              <Icon src={Icons.Cross} />
            </IconButton>
          </Header>

          <Box style={{ padding: config.space.S400 }} direction="Column" gap="300">
            <Box gap="200">
              <Box grow="Yes">
                <Input
                  variant="Background"
                  size="400"
                  outlined
                  placeholder="Search term or MyInstants link"
                  value={input}
                  onChange={(evt: React.ChangeEvent<HTMLInputElement>) =>
                    setInput(evt.target.value)
                  }
                  onKeyDown={(evt) => {
                    if (evt.key === 'Enter' && !busy) handleSearch();
                  }}
                  style={{ width: '100%' }}
                />
              </Box>
              <Button
                variant="Primary"
                size="400"
                onClick={handleSearch}
                disabled={busy || !input.trim()}
                before={busy ? <Spinner variant="Primary" fill="Solid" size="200" /> : undefined}
              >
                <Text size="B400">Search</Text>
              </Button>
            </Box>

            {results.length > 0 && (
              <>
                <Box alignItems="Center" justifyContent="SpaceBetween" gap="200">
                  <Button
                    size="300"
                    variant="Secondary"
                    fill="Soft"
                    disabled={busy}
                    onClick={() =>
                      setSelected(allSelected ? new Set() : new Set(results.map((r) => r.path)))
                    }
                  >
                    <Text size="B300">{allSelected ? 'Select none' : 'Select all'}</Text>
                  </Button>
                  <Text size="T200" priority="300">
                    {selected.size} selected · {results.length} shown
                    {nextPage ? ' · more available' : ''}
                  </Text>
                </Box>

                <div style={{ maxHeight: toRem(300), overflowY: 'auto' }}>
                  <Box direction="Column" gap="100">
                    {results.map((item, index) => {
                      const isSelected = selected.has(item.path);
                      const checkboxId = `myinstants-item-${index}`;
                      return (
                        <Box
                          key={item.path}
                          alignItems="Center"
                          gap="200"
                          style={{
                            padding: `${config.space.S100} ${config.space.S200}`,
                            borderRadius: config.radii.R300,
                            backgroundColor: isSelected ? color.Primary.Container : 'transparent',
                            color: isSelected ? color.Primary.OnContainer : undefined,
                          }}
                        >
                          <label
                            htmlFor={checkboxId}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              flexGrow: 1,
                              minWidth: 0,
                              cursor: busy ? 'default' : 'pointer',
                            }}
                          >
                            <Checkbox
                              id={checkboxId}
                              size="50"
                              variant="Primary"
                              checked={isSelected}
                              onClick={() => toggle(item.path)}
                              disabled={busy}
                            />
                            <Text size="T300" truncate>
                              {item.name}
                            </Text>
                          </label>
                          <IconButton
                            size="300"
                            variant="Surface"
                            fill="None"
                            radii="300"
                            aria-label={`Preview ${item.name}`}
                            disabled={busy}
                            onClick={() => handlePreview(item)}
                          >
                            <Icon size="100" src={Icons.Play} />
                          </IconButton>
                        </Box>
                      );
                    })}
                  </Box>
                </div>

                <Box gap="200" wrap="Wrap">
                  <Button
                    variant="Primary"
                    size="300"
                    disabled={busy || selected.size === 0}
                    onClick={handleImportSelected}
                  >
                    <Text size="B300">Import selected ({selected.size})</Text>
                  </Button>
                  <Button
                    variant="Primary"
                    fill="Soft"
                    size="300"
                    disabled={busy}
                    onClick={handleImportAll}
                  >
                    <Text size="B300">
                      Import all{nextPage ? ' results' : ` (${results.length})`}
                    </Text>
                  </Button>
                  {nextPage && (
                    <Button
                      variant="Secondary"
                      fill="Soft"
                      size="300"
                      disabled={busy}
                      onClick={loadMore}
                    >
                      <Text size="B300">Load more</Text>
                    </Button>
                  )}
                  {busy && (
                    <Button
                      variant="Critical"
                      fill="Soft"
                      size="300"
                      onClick={() => {
                        cancelRef.current = true;
                      }}
                    >
                      <Text size="B300">Stop</Text>
                    </Button>
                  )}
                </Box>
              </>
            )}

            {status && <Text size="T300">{status}</Text>}
            {error && (
              <Text size="T300" style={{ color: color.Critical.Main }}>
                {error}
              </Text>
            )}
            <Text size="T200" priority="300">
              Sounds are uploaded by MyInstants users. Only import what you may use. Clips are
              limited to 20 seconds.
            </Text>
          </Box>
        </Dialog>
      </OverlayCenter>
    </Overlay>
  );
}

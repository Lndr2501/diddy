import React, { useEffect, useState } from 'react';
import { Button, Input, Spinner, Switch, Text, toRem } from 'folds';
import { InsetGroup, InsetRow, InsetSection, SegmentedControl } from '../inset-list';
import {
  fetchGifPage,
  getGifProvider,
  GifProviderId,
  GifRating,
  GifSearchError,
} from '../../../plugins/gifSearch';
import {
  getGifCustomerId,
  setGifApiKey,
  updateGifPrefs,
  useGifPrefs,
} from '../../../state/gifPrefs';

const PROVIDERS: { value: GifProviderId; label: string }[] = [
  { value: 'giphy', label: 'GIPHY' },
  { value: 'klipy', label: 'KLIPY' },
];

const RATINGS: { value: GifRating; label: string; title: string }[] = [
  { value: 'g', label: 'G', title: 'Suitable for everyone' },
  { value: 'pg', label: 'PG', title: 'Mild content' },
  { value: 'pg-13', label: 'PG-13', title: 'Some content not suitable for children' },
  { value: 'r', label: 'R', title: 'Least filtering' },
];

const KEY_HELP: Record<GifProviderId, { site: string; how: string }> = {
  giphy: {
    site: 'developers.giphy.com',
    how: 'Create an app (type "API") in the GIPHY developer dashboard and paste its API key.',
  },
  klipy: {
    site: 'partner.klipy.com',
    how: 'Create an app in the KLIPY Partner panel and paste its app key. A test key is limited to 100 requests per minute; a production key is free. KLIPY may show ads in results if you enable them for the key (Diddy hides them).',
  },
};

type CheckState = { state: 'idle' | 'checking' | 'ok' } | { state: 'error'; message: string };

export function GifSettings() {
  const prefs = useGifPrefs();
  const provider = getGifProvider(prefs.provider);
  const key = prefs.keys[prefs.provider];
  const [check, setCheck] = useState<CheckState>({ state: 'idle' });

  useEffect(() => setCheck({ state: 'idle' }), [prefs.provider, key]);

  const handleCheck = async () => {
    setCheck({ state: 'checking' });
    try {
      await fetchGifPage(
        provider,
        { apiKey: key, rating: prefs.rating, limit: 1, customerId: getGifCustomerId() },
        (url, init) => fetch(url, init)
      );
      setCheck({ state: 'ok' });
    } catch (e) {
      setCheck({
        state: 'error',
        message: e instanceof GifSearchError ? e.message : 'The check failed.',
      });
    }
  };

  let checkText: string | undefined;
  if (check.state === 'ok') checkText = 'The key works.';
  if (check.state === 'error') checkText = check.message;

  return (
    <InsetSection
      title="GIFs"
      footer={
        <>
          Privacy: your searches (and the trending list) are loaded directly from {provider.name},
          which sees your IP address and what you search for. GIFs you send are downloaded and
          uploaded to your homeserver like any other picture (encrypted in encrypted rooms), so the
          others do not contact {provider.name}. The API key is your own and stays on this device.
        </>
      }
    >
      <InsetGroup>
        <InsetRow
          title="GIF search"
          description="Adds a GIF tab to the emoji board in the message composer."
          after={
            <Switch
              variant="Primary"
              value={prefs.enabled}
              onChange={(enabled) => updateGifPrefs({ enabled })}
            />
          }
        />
        {prefs.enabled && (
          <>
            <InsetRow
              title="Source"
              after={
                <SegmentedControl<GifProviderId>
                  aria-label="GIF source"
                  options={PROVIDERS}
                  value={prefs.provider}
                  onChange={(value) => updateGifPrefs({ provider: value })}
                />
              }
            />
            <InsetRow
              title={`${provider.name} API key`}
              description={
                <>
                  {KEY_HELP[prefs.provider].how} Get one at{' '}
                  <a href={provider.keyUrl} target="_blank" rel="noreferrer noopener">
                    {KEY_HELP[prefs.provider].site}
                  </a>
                  .{checkText && <> {checkText}</>}
                </>
              }
            >
              <form
                style={{ display: 'flex', gap: toRem(8), marginTop: toRem(8) }}
                onSubmit={(evt) => {
                  evt.preventDefault();
                  if (key) handleCheck();
                }}
              >
                <Input
                  style={{ flexGrow: 1, minWidth: 0 }}
                  variant="Secondary"
                  size="300"
                  radii="300"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Paste your API key"
                  aria-label={`${provider.name} API key`}
                  value={key}
                  maxLength={128}
                  onChange={(evt) => setGifApiKey(prefs.provider, evt.currentTarget.value)}
                  outlined
                />
                <Button
                  type="submit"
                  size="300"
                  variant="Secondary"
                  fill="Soft"
                  radii="300"
                  disabled={!key || check.state === 'checking'}
                  before={check.state === 'checking' && <Spinner size="100" variant="Secondary" />}
                >
                  <Text size="B300">Check</Text>
                </Button>
              </form>
            </InsetRow>
            <InsetRow
              title="Content rating"
              description="Highest rating shown in results."
              after={
                <SegmentedControl<GifRating>
                  aria-label="GIF content rating"
                  options={RATINGS}
                  value={prefs.rating}
                  onChange={(rating) => updateGifPrefs({ rating })}
                />
              }
            />
          </>
        )}
      </InsetGroup>
    </InsetSection>
  );
}

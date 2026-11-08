import React from 'react';
import { Switch } from 'folds';
import { InsetGroup, InsetRow, InsetSection } from '../inset-list';
import { updateWatchPrefs, useWatchPrefs } from '../../../state/watchTogether';
import {
  CATEGORY_LABELS,
  SPONSOR_CATEGORIES,
  SponsorCategory,
} from '../../../plugins/watchTogether/sponsorBlock';

/** Watch together (#83): on / off, SponsorBlock categories and what leaves your device. */
export function WatchTogetherSettings() {
  const prefs = useWatchPrefs();

  const toggleCategory = (category: SponsorCategory, on: boolean) => {
    const rest = prefs.categories.filter((c) => c !== category);
    updateWatchPrefs({ categories: on ? [...rest, category] : rest });
  };

  return (
    <InsetSection
      title="Watch together"
      footer="Videos load from YouTube (youtube-nocookie.com) in YouTube's own player, so YouTube sees your IP address and what you watch; ads YouTube shows are not blocked. The others in the call get the video link and play / pause / position as end-to-end encrypted messages (plain to-device messages when encryption is unavailable). For SponsorBlock only the first 4 characters of a hash of the video id go to sponsor.ajay.app, not the video itself."
    >
      <InsetGroup>
        <InsetRow
          title="Watch together"
          description="Watch a YouTube video with everyone in the call. Play, pause and seeking are shared; your volume and quality stay yours."
          after={
            <Switch
              variant="Primary"
              value={prefs.enabled}
              onChange={(enabled) => updateWatchPrefs({ enabled })}
            />
          }
        />
      </InsetGroup>
      {prefs.enabled && (
        <InsetGroup>
          <InsetRow
            title="Skip segments with SponsorBlock"
            description="Community data from SponsorBlock (sponsor.ajay.app, by Ajay Ramachandran and contributors, CC BY-NC-SA 4.0). When you skip, the video jumps for everybody in the call."
          />
          {SPONSOR_CATEGORIES.map((category) => (
            <InsetRow
              key={category}
              title={CATEGORY_LABELS[category]}
              after={
                <Switch
                  variant="Primary"
                  value={prefs.categories.includes(category)}
                  onChange={(on) => toggleCategory(category, on)}
                />
              }
            />
          ))}
        </InsetGroup>
      )}
    </InsetSection>
  );
}

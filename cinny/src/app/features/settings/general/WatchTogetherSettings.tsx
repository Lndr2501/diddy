import React from 'react';
import { Switch } from 'folds';
import { InsetGroup, InsetRow, InsetSection } from '../inset-list';
import { updateWatchPrefs, useWatchPrefs } from '../../../state/watchTogether';
import {
  CATEGORY_LABELS,
  SPONSOR_CATEGORIES,
  SponsorCategory,
} from '../../../plugins/watchTogether/sponsorBlock';
import { useTranslation } from 'react-i18next';

/** Watch together (#83): on / off, SponsorBlock categories and what leaves your device. */
export function WatchTogetherSettings() {
  const { t } = useTranslation();
  const prefs = useWatchPrefs();

  const toggleCategory = (category: SponsorCategory, on: boolean) => {
    const rest = prefs.categories.filter((c) => c !== category);
    updateWatchPrefs({ categories: on ? [...rest, category] : rest });
  };

  return (
    <InsetSection
      title={t('settings.watchTogether.watchTogether')}
      footer={t('settings.watchTogether.videosLoadFromYoutube')}
    >
      <InsetGroup>
        <InsetRow
          title={t('settings.watchTogether.watchTogether')}
          description={t('settings.watchTogether.watchAYoutubeVideo')}
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
            title={t('settings.watchTogether.skipSegmentsWithSponsorblock')}
            description={t('settings.watchTogether.communityDataFromSponsorblock')}
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

import React, { useState } from 'react';
import { Box, color, config, Text, toRem } from 'folds';
import { APP_ICON_IDS, AppIconId, getAppIcon, setAppIcon } from '../../../plugins/appIcon';
import { APP_ICON_IMAGES, APP_ICON_LABELS } from '../../../plugins/appIconImages';

export function AppIconPicker() {
  const [selected, setSelected] = useState<AppIconId>(getAppIcon());
  const [failed, setFailed] = useState(false);

  const handleSelect = async (id: AppIconId) => {
    setFailed(false);
    try {
      await setAppIcon(id);
      setSelected(id);
    } catch {
      setFailed(true);
    }
  };

  return (
    <Box direction="Column" gap="200">
      <Box gap="200" wrap="Wrap">
        {APP_ICON_IDS.map((id) => (
          <button
            key={id}
            type="button"
            title={APP_ICON_LABELS[id]}
            aria-label={APP_ICON_LABELS[id]}
            aria-pressed={selected === id}
            onClick={() => handleSelect(id)}
            style={{
              cursor: 'pointer',
              padding: config.space.S100,
              borderRadius: config.radii.R400,
              background: 'transparent',
              border: `2px solid ${
                selected === id ? color.Primary.Main : 'transparent'
              }`,
            }}
          >
            <img
              src={APP_ICON_IMAGES[id]}
              alt=""
              width={48}
              height={48}
              style={{ display: 'block', width: toRem(48), height: toRem(48) }}
            />
          </button>
        ))}
      </Box>
      {failed && (
        <Text size="T200" style={{ color: color.Critical.Main }}>
          Could not change the icon.
        </Text>
      )}
    </Box>
  );
}

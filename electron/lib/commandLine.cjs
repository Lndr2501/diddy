// Chromium feature switches: `--enable-features` / `--disable-features` hold one comma-separated
// list, and `app.commandLine.appendSwitch` replaces a value that is already there. A wrapper (NixOS
// adds `--enable-features=WaylandWindowDecorations` for NIXOS_OZONE_WL) would lose its entry.

const featureName = (entry) => entry.split(/[:<]/)[0];

/** Adds `feature` to a comma-separated feature list without dropping or duplicating entries. */
const mergeFeatureList = (existing, feature) => {
  const entries = String(existing ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!entries.some((entry) => featureName(entry) === featureName(feature))) entries.push(feature);
  return entries.join(',');
};

/** Appends a feature to a switch of `app.commandLine`, keeping what is already set. */
const addFeatureSwitch = (commandLine, name, feature) => {
  commandLine.appendSwitch(name, mergeFeatureList(commandLine.getSwitchValue(name), feature));
};

module.exports = { mergeFeatureList, addFeatureSwitch };

#!/usr/bin/env node
// Builds the AltStore/SideStore source file (altstore.json) for a Diddy release.
// Usage: node altstore-source.cjs --version 1.5.2 --ipa Diddy_1.5.2_iOS_unsigned.ipa \
//          --repo Lndr2501/diddy --notes changes.md --out altstore.json [--base-url https://host/diddy]
// Without --base-url the IPA is linked on the GitHub release; with it, to <base-url>/<ipa file name>.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const BUNDLE_ID = 'app.diddy.ios';
const MAX_NOTES = 1500;

function buildSource({ version, ipaName, size, date, repo, notes, baseUrl }) {
  if (!version || !ipaName || !(size > 0) || !repo) throw new Error('version, ipaName, size and repo are required');
  const base = baseUrl ? baseUrl.replace(/\/+$/, '') : null;
  const downloadURL = base
    ? `${base}/${ipaName}`
    : `https://github.com/${repo}/releases/download/v${version}/${ipaName}`;
  const iconURL = base
    ? `${base}/icon.png`
    : `https://raw.githubusercontent.com/${repo}/v${version}/ios/Diddy/Resources/Assets.xcassets/AppIcon.appiconset/icon.png`;
  let description = String(notes || '').trim();
  if (description.length > MAX_NOTES) description = `${description.slice(0, MAX_NOTES - 1).trimEnd()}…`;
  const when = new Date(date).toISOString();
  return {
    name: 'Diddy',
    identifier: 'app.diddy.source',
    subtitle: 'Matrix client',
    description: 'Diddy for iPhone and iPad (unsigned build, signed by AltStore or SideStore with your Apple ID).',
    apps: [
      {
        name: 'Diddy',
        bundleIdentifier: BUNDLE_ID,
        developerName: 'Diddy',
        subtitle: 'Matrix client',
        localizedDescription: 'A Matrix client with calls, themes and plugins.',
        iconURL,
        tintColor: 'E60A78',
        // Legacy fields (older AltStore/SideStore versions) ...
        version,
        versionDate: when,
        versionDescription: description,
        downloadURL,
        size,
        // ... and the current format.
        versions: [{ version, date: when, localizedDescription: description, downloadURL, size, minOSVersion: '16.0' }],
      },
    ],
    news: [],
  };
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

if (require.main === module) {
  const ipa = arg('ipa');
  const source = buildSource({
    version: arg('version'),
    ipaName: ipa && path.basename(ipa),
    size: ipa ? fs.statSync(ipa).size : 0,
    date: arg('date') || new Date().toISOString(),
    repo: arg('repo'),
    notes: arg('notes') ? fs.readFileSync(arg('notes'), 'utf8') : '',
    baseUrl: arg('base-url'),
  });
  fs.writeFileSync(arg('out') || 'altstore.json', `${JSON.stringify(source, null, 2)}\n`);
}

module.exports = { buildSource, BUNDLE_ID };

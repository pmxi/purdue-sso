import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const userscript = await readFile(new URL('purdue-sso.user.js', root), 'utf8');
const start = userscript.indexOf('  function visible(element) {');
const end = userscript.lastIndexOf('})();');
if (start < 0 || end <= start) throw new Error('Userscript layout changed; update the extension builder.');

const content = `// Generated from purdue-sso.user.js by scripts/build-chrome-extension.mjs.
// Edit the userscript's shared sign-in logic, then run npm run build:chrome.
(async () => {
  'use strict';
  const config = await chrome.storage.local.get(['username', 'password', 'totp_uri', 'enabled', 'campus', 'manual_pause_until']);
  if (!config.enabled || !config.username || !config.password || !config.totp_uri) return;
  config.username = config.username.trim().replace(/@purdue\\.edu$/i, '');
  config.email = config.username + '@purdue.edu';
  const tenant = '4130bd39-7c53-419c-b1e5-8758d6d63f21';
  const microsoft = location.hostname === 'login.microsoftonline.com';
  const brightspace = location.hostname === 'purdue.brightspace.com';
  if (location.protocol !== 'https:' || ![
    'sso.purdue.edu', 'idp.purdue.edu', 'login.microsoftonline.com', 'purdue.brightspace.com',
  ].includes(location.hostname)) return;

  const prefix = 'purdue-autologin:';
  const email = config.email.toLowerCase();
  const campusChoice = config.campus || 'Purdue West Lafayette / Indianapolis';
  let stopped = false;
  let pausedUntil = Number(config.manual_pause_until) || 0;
  let busy = false;
  const done = new Set();
  let started = Date.now();
  let timer;
  let resumeTimer;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.manual_pause_until) return;
    pausedUntil = Number(changes.manual_pause_until.newValue) || 0;
    scheduleTicks();
  });
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message === 'retry-sign-in') {
      for (const key of Object.keys(sessionStorage)) {
        if (key.startsWith(prefix)) sessionStorage.removeItem(key);
      }
      location.reload();
      return;
    }
    if (message === 'sign-out-brightspace') {
      void signOutBrightspace().then(sendResponse);
      return true;
    }
  });

${userscript.slice(start, end)}
})();
`;
const target = new URL('chrome-extension/content.js', root);
if (process.argv.includes('--check')) {
  const existing = await readFile(target, 'utf8');
  if (existing !== content) throw new Error(`${fileURLToPath(target)} is stale. Run npm run build:chrome.`);
} else {
  await writeFile(target, content);
}

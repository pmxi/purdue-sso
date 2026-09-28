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
  const config = await chrome.storage.local.get(['username', 'password', 'totp_uri', 'enabled', 'campus', 'manual_pause_until', 'auth_flow']);
  const ready = config.enabled && config.username && config.password && config.totp_uri;
  config.username = (config.username || '').trim().replace(/@purdue\\.edu$/i, '');
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
  let stopped = !ready;
  let pausedUntil = Number(config.manual_pause_until) || 0;
  let busy = false;
  const done = new Set();
  let started = Date.now();
  let timer;
  let resumeTimer;
  let authFlow = config.auth_flow || null;
  async function setAuthFlow(next) {
    authFlow = next;
    if (next) await chrome.storage.local.set({ auth_flow: next });
    else await chrome.storage.local.remove('auth_flow');
    scheduleTicks();
  }
  async function flowStep(text) {
    if (!authFlow) return false;
    if (authFlow.phase === 'logging-out') return true;
    if (authFlow.phase === 'microsoft') {
      if (microsoft && /which account do you want to sign out of\\?/i.test(text)) {
        click('microsoft-signout:' + authFlow.id, savedAccountTile());
      } else if (microsoft && /you signed out of your account/i.test(text)
        && !done.has('microsoft-signed-out:' + authFlow.id)) {
        done.add('microsoft-signed-out:' + authFlow.id);
        void chrome.runtime.sendMessage({ type: 'microsoft-signed-out', flowId: authFlow.id });
      }
      return true;
    }
    if (authFlow.phase === 'signed-out') return true;
    if (authFlow.phase === 'other') {
      if (brightspace && location.pathname.toLowerCase() !== '/d2l/login') await setAuthFlow(null);
      return true;
    }
    if (authFlow.phase !== 'choosing') return true;
    if (brightspace) {
      if (location.pathname.toLowerCase() !== '/d2l/login') await setAuthFlow(null);
      return location.pathname.toLowerCase() !== '/d2l/login';
    }
    if (!microsoft) return false;
    if (purdueAccountPicker(text)) return true;
    const accounts = identity();
    if (accounts.includes(email)) {
      await setAuthFlow(null);
      return false;
    }
    if (accounts.some(account => account !== config.username.toLowerCase())) {
      await setAuthFlow({ ...authFlow, phase: 'other' });
    }
    return true;
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.manual_pause_until) pausedUntil = Number(changes.manual_pause_until.newValue) || 0;
    if (changes.auth_flow) authFlow = changes.auth_flow.newValue || null;
    if (!changes.manual_pause_until && !changes.auth_flow) return;
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
      authFlow = { phase: 'logging-out' };
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

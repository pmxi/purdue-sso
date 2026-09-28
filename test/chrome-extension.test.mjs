import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { generateTotp } from './reference-totp.mjs';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('chrome-extension/manifest.json', root), 'utf8'));
const packageJson = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const content = await readFile(new URL('chrome-extension/content.js', root), 'utf8');
const optionsSource = await readFile(new URL('chrome-extension/options.js', root), 'utf8');

assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.version, packageJson.version, 'Keep extension and package versions aligned');
assert.deepEqual(manifest.permissions, ['storage', 'activeTab']);
assert.equal(manifest.host_permissions, undefined);
assert.equal(manifest.background, undefined, 'Automatic sign-in needs no background worker');
assert.deepEqual(manifest.content_scripts[0].matches, [
  'https://sso.purdue.edu/*',
  'https://idp.purdue.edu/*',
  'https://login.microsoftonline.com/*',
  'https://purdue.brightspace.com/*',
]);
assert.equal(manifest.content_scripts[0].all_frames, false);
console.log('Passed: Chrome manifest scope.');

async function runContent(enabled) {
  let submits = 0;
  let storageReads = 0;
  class Input {
    constructor() { this._value = ''; }
    set value(value) { this._value = value; }
    get value() { return this._value; }
    getAttribute() { return null; }
    closest() { return null; }
    getClientRects() { return [{}]; }
    dispatchEvent() {}
  }
  const username = new Input();
  const next = { value: 'Next', getAttribute: () => null, closest: () => null,
    getClientRects: () => [{}], click: () => { submits++; } };
  const context = vm.createContext({
    URL, crypto: webcrypto, console, HTMLInputElement: Input,
    Event: class { constructor(type) { this.type = type; } },
    location: { protocol: 'https:', hostname: 'login.microsoftonline.com',
      pathname: '/4130bd39-7c53-419c-b1e5-8758d6d63f21/login' },
    sessionStorage: { getItem: () => null, setItem() {} },
    getComputedStyle: () => ({ visibility: 'visible' }),
    setInterval: () => 1,
    clearInterval() {}, clearTimeout() {}, setTimeout: () => 1,
    document: { body: { innerText: 'Sign in Next' }, querySelectorAll(selector) {
      if (selector.startsWith('#displayName')) return [];
      if (selector.startsWith('input[name="loginfmt"]')) return [username];
      if (selector.startsWith('button, a,')) return [next];
      return [];
    } },
    chrome: { storage: { onChanged: { addListener() {} }, local: { async get() {
      storageReads++;
      return { username: 'test', password: 'dummy',
        totp_uri: 'otpauth://totp/Test?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', enabled };
    } } }, runtime: { onMessage: { addListener() {} } } },
  });
  await vm.runInContext(content, context);
  return { submits, storageReads, username: username.value };
}

assert.deepEqual(await runContent(false), { submits: 0, storageReads: 1, username: '' });
assert.deepEqual(await runContent(true), { submits: 1, storageReads: 1, username: 'test@purdue.edu' });
console.log('Passed: Chrome startup stays off until enabled and submits the configured Purdue account.');

const listeners = {};
const inputs = Object.fromEntries(['username', 'password', 'totp_uri', 'campus', 'enabled', 'status', 'current-code']
  .map(key => [key, { value: '', checked: false, textContent: '' }]));
let savedSettings;
let removedSettings;
const form = { addEventListener: (name, handler) => { listeners[name] = handler; }, reset() {} };
const clearButton = { addEventListener: (name, handler) => { listeners.clear = handler; } };
const refreshButton = { addEventListener: (name, handler) => { listeners.refresh = handler; } };
const optionsContext = vm.createContext({
  URL, crypto: webcrypto, Date: class extends Date { static now() { return 59_000; } },
  document: { querySelector(selector) {
    if (selector === '#settings') return form;
    if (selector === '#clear') return clearButton;
    if (selector === '#refresh-code') return refreshButton;
    return inputs[selector.slice(1)];
  } },
  chrome: { storage: { local: {
    async get() { return {}; },
    async set(value) { savedSettings = value; },
    async remove(value) { removedSettings = value; },
  } } },
});
await vm.runInContext(`(async () => { ${optionsSource} })()`, optionsContext);
inputs.username.value = 'test@purdue.edu';
inputs.password.value = ' keep spaces ';
inputs.totp_uri.value = '123456';
inputs.enabled.checked = true;
await listeners.submit({ preventDefault() {} });
assert.equal(savedSettings, undefined, 'A six-digit code is not an enrollment URI');
inputs.totp_uri.value = 'otpauth://totp/Test?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
await listeners.submit({ preventDefault() {} });
assert.equal(savedSettings.username, 'test');
assert.equal(savedSettings.password, ' keep spaces ', 'Do not alter the password');
assert.equal(savedSettings.enabled, true);
assert.equal(savedSettings.campus, 'Purdue West Lafayette / Indianapolis');
assert.equal(savedSettings.totp_uri, inputs.totp_uri.value);
assert.equal(inputs['current-code'].textContent, generateTotp(inputs.totp_uri.value, 59_000));
inputs.totp_uri.value = 'GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ';
await listeners.submit({ preventDefault() {} });
assert.equal(savedSettings.totp_uri, 'otpauth://totp/Purdue%3Atest%40purdue.edu?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Purdue');
assert.equal(inputs['current-code'].textContent, generateTotp(savedSettings.totp_uri, 59_000));
await listeners.clear();
assert.equal(removedSettings.join(','), 'username,password,totp_uri,campus,enabled,manual_pause_until,auth_flow');
assert.equal(inputs['current-code'].textContent, '');
console.log('Passed: Chrome options accept a setup key, reject a one-time code, preserve credentials, and clear settings.');

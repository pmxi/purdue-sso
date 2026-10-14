import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

for (const apiName of ['chrome', 'browser']) {
  test(`Extension manifest and startup (${apiName} API)`, async () => {
    const root = new URL('../', import.meta.url);
    const manifest = JSON.parse(await readFile(new URL('extension/manifest.json', root), 'utf8'));
    const packageJson = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
    const totpSource = await readFile(new URL('../extension/totp.js', import.meta.url), 'utf8');
    const content = totpSource + '\n' + await readFile(new URL('extension/content.js', root), 'utf8');

    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.version, packageJson.version, 'Keep extension and package versions aligned');
    assert.deepEqual(manifest.permissions, ['storage']);
    assert.equal(manifest.host_permissions, undefined);
    assert.equal(manifest.background, undefined, 'Automatic sign-in needs no background worker');
    assert.deepEqual(manifest.content_scripts[0].matches, [
      'https://sso.purdue.edu/*',
      'https://idp.purdue.edu/*',
      'https://login.microsoftonline.com/*',
      'https://purdue.brightspace.com/*',
    ]);
    assert.equal(manifest.content_scripts[0].all_frames, false);

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
        document: { body: { innerText: 'Sign in Next' }, querySelector: () => null, querySelectorAll(selector) {
          if (selector.startsWith('#displayName')) return [];
          if (selector.startsWith('input[name="loginfmt"]')) return [username];
          if (selector.startsWith('button, a,')) return [next];
          return [];
        } },
        [apiName]: { storage: { onChanged: { addListener() {} }, local: { async get(keys) {
          storageReads++;
          const saved = { username: 'test', password: 'dummy',
            totp_uri: 'otpauth://totp/Test?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', enabled };
          return Object.fromEntries(keys.filter(key => key in saved).map(key => [key, saved[key]]));
        } } } },
      });
      await vm.runInContext(content, context);
      return { submits, storageReads, username: username.value };
    }

    assert.deepEqual(await runContent(false), { submits: 0, storageReads: 1, username: '' });
    assert.deepEqual(await runContent(true), { submits: 1, storageReads: 1, username: 'test@purdue.edu' });

  });
}

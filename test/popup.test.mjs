import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');

for (const apiName of ['chrome', 'browser']) {
  test(`Toggle and settings popup (${apiName} API)`, async () => {
    const store = { enabled: true, username: 'test', password: 'dummy', totp_uri: 'test-enrollment' };
    let click;
    let openSettings;
    let onChanged;
    let optionsOpened = 0;
    let failSave = false;
    const attributes = {};
    const toggle = {
      dataset: {}, disabled: true, title: '',
      setAttribute(name, value) { attributes[name] = value; },
      removeAttribute(name) { delete attributes[name]; },
      addEventListener(_type, handler) { click = handler; },
    };
    const state = { textContent: '' };
    const settingsButton = { addEventListener(_type, handler) { openSettings = handler; } };
    const context = vm.createContext({
      document: { querySelector: selector => ({ '#toggle': toggle, '#state': state, '#settings': settingsButton })[selector] },
      [apiName]: {
        storage: {
          local: {
            async get() { return { ...store }; },
            async set(values) {
              if (failSave) throw new Error('Synthetic storage failure');
              Object.assign(store, values);
            },
          },
          onChanged: { addListener(listener) { onChanged = listener; } },
        },
        runtime: { async openOptionsPage() { optionsOpened++; } },
      },
    });

    await vm.runInContext(source, context);
    assert.equal(state.textContent, 'Enabled');
    assert.equal(toggle.dataset.enabled, 'true');
    assert.equal(attributes['aria-checked'], 'true');
    assert.equal(toggle.disabled, false);
    await openSettings();
    assert.equal(optionsOpened, 1, 'Settings remains accessible after setup');
    assert.equal(store.enabled, true, 'Opening settings does not toggle sign-in');

    await click();
    assert.equal(store.enabled, false);
    assert.equal(state.textContent, 'Disabled');
    assert.equal(toggle.dataset.enabled, 'false');
    assert.equal(attributes['aria-checked'], 'false');
    await click();
    assert.equal(store.enabled, true);
    assert.equal(state.textContent, 'Enabled');

    // Changes from the options page must update an open popup too.
    store.enabled = false;
    onChanged({ enabled: { newValue: false } }, 'local');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(state.textContent, 'Disabled');

    // A failed write must not falsely show that automation was enabled.
    failSave = true;
    await click();
    assert.equal(store.enabled, false);
    assert.equal(toggle.dataset.enabled, 'false');
    assert.equal(state.textContent, 'Try again');
    assert.equal(toggle.disabled, false);
    failSave = false;
    await click();
    assert.equal(store.enabled, true);

    delete store.password;
    onChanged({ password: { newValue: undefined } }, 'local');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(state.textContent, 'Set up');
    assert.equal(toggle.dataset.enabled, 'false');
    assert.equal(attributes['aria-checked'], undefined);
    await click();
    assert.equal(optionsOpened, 2, 'The main button also opens setup when credentials are missing');
  });
}

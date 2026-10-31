import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { generateTotp } from './reference-totp.mjs';

const totpSource = await readFile(new URL('../extension/totp.js', import.meta.url), 'utf8');
const optionsSource = await readFile(new URL('../extension/options.js', import.meta.url), 'utf8');
const uri = 'otpauth://totp/Test?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const fields = ['username', 'password', 'totp_uri', 'campus', 'enabled'];
const flush = () => new Promise(resolve => setImmediate(resolve));

async function openSettings(apiName, initial = {}, generate = generateTotp) {
  const store = { ...initial };
  const listeners = {};
  const timers = new Map();
  const writes = [];
  const nodes = Object.fromEntries([...fields, 'status', 'status-title', 'status-detail', 'current-code', 'code-timer',
    'code-countdown', 'code-progress'].map(id => [id, { id, value: '', checked: false, textContent: '', hidden: false, dataset: {} }]));
  nodes['current-code'].textContent = '—';
  nodes['code-timer'].hidden = true;
  const form = {
    inert: false,
    addEventListener(type, handler) { listeners[type] = handler; },
    // Mirrors the HTML defaults, including the checked enable box.
    reset() {
      for (const field of fields) { nodes[field].value = ''; nodes[field].checked = field === 'enabled'; }
      nodes.campus.value = 'Purdue West Lafayette / Indianapolis';
    },
  };
  let now = 59_000;
  let nextTimer = 0;
  let beforeSave = async () => {};
  function schedule(callback, delay, repeat = false) {
    const id = ++nextTimer;
    timers.set(id, { callback, due: now + delay, delay, repeat });
    return id;
  }
  const context = vm.createContext({
    URL, Date: class extends Date { static now() { return now; } },
    testGenerate: async (...args) => generate(...args),
    setTimeout: (callback, delay) => schedule(callback, delay),
    clearTimeout: id => timers.delete(id),
    setInterval: (callback, delay) => schedule(callback, delay, true),
    document: {
      addEventListener(type, handler) { listeners[type] = handler; },
      querySelector(selector) {
        if (selector === '#settings') return form;
        if (selector === '#clear') return { addEventListener(_type, handler) { listeners.clear = handler; } };
        return nodes[selector.slice(1)];
      },
    },
    PurdueSettings: { async request(type, values) {
      if (type === 'settings.read') return { ...store };
      if (type === 'settings.clear') { for (const key of fields) delete store[key]; return; }
      assert.equal(type, 'settings.write');
      await beforeSave();
      const { field, value } = values;
      writes.push({ [field]: value });
      store[field] = value;
      listeners.storage({ [field]: { newValue: value } }, 'local');
    } },
    [apiName]: { storage: {
      onChanged: { addListener(handler) { listeners.storage = handler; } },
      local: {
        async get(keys) { return Object.fromEntries(keys.filter(key => key in store).map(key => [key, store[key]])); },
        async set(values) {
          await beforeSave();
          writes.push({ ...values });
          const changes = Object.fromEntries(Object.keys(values).map(key => [key, { newValue: values[key] }]));
          Object.assign(store, values);
          listeners.storage(changes, 'local');
        },
        async remove(keys) { for (const key of keys) delete store[key]; },
      },
    } },
  });
  vm.runInContext(totpSource, context);
  vm.runInContext('PurdueTotp = { ...PurdueTotp, generateTotp: testGenerate };', context);
  await vm.runInContext(`(async () => { ${optionsSource} })()`, context);
  await flush();
  return {
    store, writes, nodes, form,
    get status() {
      return `${nodes.status.dataset.state} | ${nodes['status-title'].textContent} | ${nodes['status-detail'].textContent}`;
    },
    set beforeSave(callback) { beforeSave = callback; },
    async edit(field, value, type = 'input') {
      if (field === 'enabled') nodes[field].checked = value;
      else nodes[field].value = value;
      listeners[type]({ target: nodes[field] });
      await flush();
    },
    async advance(milliseconds) {
      const end = now + milliseconds;
      while (true) {
        const next = [...timers].filter(([, timer]) => timer.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
        if (!next) break;
        const [id, timer] = next;
        now = timer.due;
        if (timer.repeat) timer.due += timer.delay;
        else timers.delete(id);
        timer.callback();
        await flush();
      }
      now = end;
    },
    async returnToPage(time) { now = time; listeners.visibilitychange(); await flush(); },
    async externalEnabled(enabled) {
      store.enabled = enabled;
      listeners.storage({ enabled: { newValue: enabled } }, 'local');
      await flush();
    },
    clear: () => listeners.clear(),
  };
}

for (const apiName of ['chrome', 'browser']) {
  test(`Settings autosave fields and reject invalid edits (${apiName} API)`, async () => {
    const page = await openSettings(apiName);
    assert.equal(page.status, 'incomplete | Incomplete | Still needed: career account, password, and authenticator key.');
    await page.edit('username', 'tes');
    assert.equal(page.status, 'incomplete | Incomplete | Saving…');
    await page.advance(399);
    assert.equal(page.writes.length, 0, 'Wait for a typing pause');
    await page.edit('username', ' test@purdue.edu ');
    await page.advance(400);
    assert.deepEqual(page.writes, [{ username: 'test' }]);
    assert.equal(page.status, 'incomplete | Incomplete | Still needed: password and authenticator key.');

    await page.edit('password', ' keep spaces ');
    await page.edit('password', ' keep spaces ', 'change');
    assert.equal(page.store.password, ' keep spaces ', 'Blur saves without altering the password');
    await page.edit('totp_uri', '123456');
    await page.advance(400);
    assert.equal(page.store.totp_uri, undefined, 'A six-digit code is not a setup key');
    assert.match(page.status, /^error \| Not saved \| .*incomplete or invalid/);
    await page.edit('enabled', true, 'change');
    assert.equal(page.store.enabled, true);
    assert.match(page.status, /incomplete or invalid/, 'An unrelated save must not hide an invalid field');

    await page.edit('totp_uri', 'GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ');
    await page.advance(400);
    assert.equal(page.store.totp_uri, 'otpauth://totp/Purdue%3Atest%40purdue.edu?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Purdue');
    assert.match(page.nodes['current-code'].textContent, /^\d{6}$/);
    assert.equal(page.status, 'ready | Ready | Saved. Automatic sign-in is on.');
    await page.edit('campus', 'Purdue Fort Wayne', 'change');
    assert.equal(page.store.campus, 'Purdue Fort Wayne');

    await page.externalEnabled(false);
    assert.equal(page.nodes.enabled.checked, false);
    assert.equal(page.status, 'disabled | Disabled | Saved. Automatic sign-in is off.');
    await page.edit('password', 'new password', 'change');
    assert.deepEqual(page.writes.at(-1), { password: 'new password' }, 'Only save the edited field');
    assert.equal(page.store.enabled, false, 'Editing credentials must not undo the popup toggle');
    await page.edit('username', '', 'change');
    assert.equal(page.store.username, 'test');
    assert.equal(page.status, 'error | Not saved | Enter your career account to save it.');

    await page.edit('password', 'pending edit');
    await page.clear();
    await page.advance(1000);
    assert.deepEqual(page.store, {});
    assert.equal(page.nodes['current-code'].textContent, '—');
    assert.equal(page.nodes['code-timer'].hidden, true);
    assert.equal(page.nodes.enabled.checked, true, 'Clearing restores the enabled default');
    assert.equal(page.status, 'incomplete | Incomplete | Settings cleared. Reload any open Purdue sign-in page.');
    await page.edit('username', 'next');
    assert.equal(page.status, 'incomplete | Incomplete | Saving…', 'Editing replaces the cleared notice');
  });
}

test('Automatic sign-in is on by default and stays off once turned off', async () => {
  const page = await openSettings('chrome');
  assert.equal(page.nodes.enabled.checked, true);
  await page.edit('username', 'test', 'change');
  await page.edit('password', 'dummy', 'change');
  assert.equal(page.status, 'incomplete | Incomplete | Still needed: authenticator key.');
  await page.edit('totp_uri', uri, 'change');
  assert.equal(page.status, 'ready | Ready | Saved. Automatic sign-in is on.');
  assert.equal(page.store.enabled, undefined, 'Finishing setup needs no separate enable step');

  const off = await openSettings('browser', { username: 'test', password: 'dummy', totp_uri: uri, enabled: false });
  assert.equal(off.nodes.enabled.checked, false);
  assert.equal(off.status, 'disabled | Disabled | Saved. Automatic sign-in is off.');
});

test('Verification code and countdown refresh at the configured period, including after a hidden tab', async () => {
  for (const period of [30, 60]) {
    const enrollment = `${uri}&period=${period}`;
    let generations = 0;
    const page = await openSettings('chrome', { totp_uri: enrollment }, (value, now) => {
      generations++;
      return generateTotp(value, now);
    });
    assert.equal(page.nodes['current-code'].textContent, generateTotp(enrollment, 59_000));
    assert.equal(page.nodes['code-countdown'].textContent, '1s');
    assert.equal(page.nodes['code-progress'].max, period);
    await page.advance(1000);
    assert.equal(page.nodes['current-code'].textContent, generateTotp(enrollment, 60_000));
    assert.equal(page.nodes['code-countdown'].textContent, `${period}s`);
    assert.equal(page.nodes['code-progress'].value, period);
    await page.advance(1000);
    assert.equal(page.nodes['code-countdown'].textContent, `${period - 1}s`);
    assert.equal(generations, 2, 'Generate once per period, while the countdown changes each second');
    await page.returnToPage(121_000);
    assert.equal(page.nodes['current-code'].textContent, generateTotp(enrollment, 121_000));
    assert.equal(page.nodes['code-countdown'].textContent, `${period - 1}s`);
  }
});

test('Expired or cleared verification codes never return after delayed generation', async () => {
  let resolveCode;
  let delay = false;
  const page = await openSettings('chrome', { totp_uri: uri }, (value, now) => delay
    ? new Promise(resolve => { resolveCode = () => resolve(generateTotp(value, now)); })
    : generateTotp(value, now));
  delay = true;
  await page.advance(1000);
  assert.equal(page.nodes['current-code'].textContent, '—', 'Hide the expired code while generating its replacement');
  await page.returnToPage(90_000);
  resolveCode();
  await flush();
  assert.equal(page.nodes['current-code'].textContent, '—', 'Discard a result whose period already expired');
  await page.returnToPage(90_000);
  await page.clear();
  resolveCode();
  await flush();
  assert.equal(page.nodes['current-code'].textContent, '—');
  assert.equal(page.nodes['code-timer'].hidden, true);
});

test('Clear settings waits for an in-flight save and prevents the code from reappearing', async () => {
  const page = await openSettings('browser');
  let release;
  page.beforeSave = () => new Promise(resolve => { release = resolve; });
  await page.edit('totp_uri', uri, 'change');
  const clearing = page.clear();
  assert.equal(page.form.inert, true);
  release();
  await clearing;
  await flush();
  assert.deepEqual(page.store, {});
  assert.equal(page.nodes['current-code'].textContent, '—');
  assert.equal(page.nodes['code-timer'].hidden, true);
  assert.equal(page.form.inert, false);
});

test('A failed autosave reports failure and a subsequent edit can retry', async () => {
  const page = await openSettings('chrome', { password: 'original' });
  page.beforeSave = async () => { throw new Error('Synthetic storage failure'); };
  await page.edit('password', 'edited', 'change');
  assert.equal(page.store.password, 'original');
  assert.match(page.status, /^error \| Not saved \| Could not save/);
  page.beforeSave = async () => {};
  await page.edit('password', 'edited again', 'change');
  assert.equal(page.store.password, 'edited again');
  assert.equal(page.status, 'incomplete | Incomplete | Still needed: career account and authenticator key.');
});

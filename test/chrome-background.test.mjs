import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../chrome-extension/background.js', import.meta.url), 'utf8');

async function run(kind, cancelAt = '', loginPage = false) {
  const startUrl = loginPage
    ? 'https://purdue.brightspace.com/d2l/login?sessionExpired=1&target=%2fd2l%2fhome%2f1643449'
    : 'https://purdue.brightspace.com/d2l/home/1643449';
  const tabs = new Map([[7, { id: 7, url: startUrl, status: 'complete' }]]);
  if (loginPage) tabs.set(9, { id: 9,
    url: 'https://purdue.brightspace.com/d2l/lp/auth/saml/error', status: 'complete' });
  const store = { manual_pause_until: kind === 'manual' ? -1 : 0 };
  const actions = [];
  let listener;
  let nextId = 8;
  const context = vm.createContext({
    URL, Date, Math, Error, setTimeout,
    chrome: {
      runtime: { getManifest: () => ({ version: '1.0.10' }), onMessage: { addListener(fn) { listener = fn; } } },
      storage: { local: {
        async set(value) { Object.assign(store, value); },
        async get() { return { ...store }; },
        async remove(key) { delete store[key]; },
      } },
      tabs: {
        async query() { return Array.from(tabs.values()).filter(tab => tab.url.startsWith('https://purdue.brightspace.com/')); },
        async get(id) { return tabs.get(id); },
        async sendMessage(id, message) {
          actions.push(['message', id, message]);
          tabs.get(id).url = 'https://purdue.brightspace.com/d2l/login?logout=1';
          if (cancelAt === 'brightspace') delete store.auth_flow;
          return true;
        },
        async create(value) {
          const tab = { id: nextId++, url: value.url, status: 'complete' };
          tabs.set(tab.id, tab);
          actions.push(['create', tab.id, value.url]);
          return tab;
        },
        async update(id, value) {
          actions.push(['update', id, value.url]);
          Object.assign(tabs.get(id), value);
          return tabs.get(id);
        },
        async remove(id) { actions.push(['remove', id]); tabs.delete(id); },
      },
    },
  });
  vm.runInContext(source, context);
  const result = await new Promise(resolve => listener({ type: 'start-flow', kind,
    source: { id: 7, url: startUrl } }, {}, resolve));
  if (loginPage) {
    assert.equal(result.ok, true);
    assert.equal(store.auth_flow.phase, 'microsoft');
    assert.equal(store.auth_flow.version, '1.0.10');
    assert.ok(!actions.some(([action, , value]) => action === 'message'
      && value === 'sign-out-brightspace'), 'No Brightspace logout control is needed on its login page');
    assert.ok(!actions.some(([action, , url]) => action === 'create'
      && url?.includes('/d2l/home/')), 'Do not open an arbitrary Brightspace home page');
    return;
  }
  if (cancelAt === 'brightspace') {
    assert.equal(result.ok, false);
    assert.equal(store.auth_flow, undefined);
    assert.ok(!actions.some(([action, , url]) => action === 'update'
      && url?.endsWith('/oauth2/v2.0/logout')));
    return;
  }
  assert.equal(result.ok, true);
  assert.equal(store.auth_flow.phase, 'microsoft');
  assert.ok(actions.some(([action, id, value]) => action === 'message'
    && id === 7 && value === 'sign-out-brightspace'));
  assert.ok(actions.some(([action, , url]) => action === 'update'
    && url?.endsWith('/oauth2/v2.0/logout')), 'Microsoft sign-out starts after Brightspace logout');
  const flowId = store.auth_flow.id;
  if (cancelAt === 'microsoft') {
    delete store.auth_flow;
    listener({ type: 'microsoft-signed-out', flowId }, { tab: { id: 8 } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(store.auth_flow, undefined);
    assert.ok(!actions.some(([action, id, url]) => action === 'update'
      && id === 7 && url === startUrl));
    return;
  }
  listener({ type: 'microsoft-signed-out', flowId }, { tab: { id: 999 } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(store.auth_flow.phase, 'microsoft', 'Ignore completion from another tab');
  listener({ type: 'microsoft-signed-out', flowId }, { tab: { id: 8 } });
  await new Promise(resolve => setImmediate(resolve));
  if (kind === 'switch') {
    assert.equal(store.auth_flow.phase, 'choosing');
    assert.equal(tabs.get(7).url, startUrl, 'Reload the original page to reach the account picker');
  } else if (kind === 'manual') {
    assert.equal(store.auth_flow, undefined);
    assert.equal(store.manual_pause_until, -1, 'Sign-out preserves complete manual');
  } else {
    assert.equal(store.auth_flow.phase, 'signed-out');
    assert.equal(tabs.get(7).url, 'https://purdue.brightspace.com/d2l/login?logout=1');
  }
  assert.ok(actions.some(([action, id]) => action === 'remove' && id === 8));
}

await run('switch');
await run('manual');
await run('logout');
await run('switch', 'brightspace');
await run('switch', 'microsoft');
await run('logout', '', true);
await run('switch', '', true);
console.log('Passed: logout modes, canceled flows, and already-signed-out Brightspace pages.');

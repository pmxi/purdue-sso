import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';
import { createVault } from '../extension/vault.js';
import { createHandler } from '../extension/background.js';
import { generateTotp } from './reference-totp.mjs';

const uri = 'otpauth://totp/Test?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const credentials = { username: 'synthetic-user', password: 'synthetic-password', totp_uri: uri, campus: 'Purdue Global' };
function fixture(initial = {}) {
  const data = structuredClone(initial);
  const indexedDB = new IDBFactory();
  let failWrite = false;
  const storage = {
    async get(keys) { return structuredClone(Object.fromEntries(keys.filter(key => key in data).map(key => [key, data[key]]))); },
    async set(values) { if (failWrite) throw new Error('Write failed'); Object.assign(data, structuredClone(values)); },
    async remove(keys) { for (const key of keys) delete data[key]; },
  };
  const api = { storage: { local: storage }, runtime: { id: 'test-extension', getURL: name => `moz-extension://test-extension/${name}` } };
  const options = { id: api.runtime.id, url: api.runtime.getURL('options.html') };
  const popup = { ...options, url: api.runtime.getURL('popup.html') };
  const content = { id: api.runtime.id, url: 'https://login.microsoftonline.com/common/login', frameId: 0, tab: { id: 1 } };
  const makeVault = () => createVault(storage, indexedDB, webcrypto);
  const restart = () => createHandler(api, makeVault());
  const handler = restart();
  const send = (type, values = {}, sender = options) => handler.handle({ type, ...values }, sender);
  async function keyOperation(operation) {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('purdue-sso-keys', 1);
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('keys', 'readwrite');
        const req = operation(tx.objectStore('keys'));
        tx.oncomplete = () => resolve(req.result); tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  }
  return { data, storage, api, options, popup, content, send, restart, makeVault, keyOperation,
    set failWrite(value) { failWrite = value; } };
}

async function setup(f) {
  await Promise.all(Object.entries(credentials).map(([field, value]) => f.send('settings.write', { field, value })));
  await f.send('settings.write', { field: 'enabled', value: true });
}

test('AES-256-GCM encrypts the entire profile, uses fresh IVs, and restores a non-exportable key after restart', async () => {
  const f = fixture();
  await setup(f);
  assert.deepEqual(Object.keys(f.data).sort(), ['enabled', 'vault']);
  for (const value of Object.values(credentials)) assert.ok(!JSON.stringify(f.data).includes(value));
  const first = structuredClone(f.data.vault);
  await f.send('settings.write', { field: 'password', value: credentials.password });
  assert.notDeepEqual(f.data.vault.iv, first.iv);
  assert.notDeepEqual(f.data.vault.data, first.data);
  const key = await f.keyOperation(store => store.get('credentials'));
  assert.equal(key.extractable, false);
  assert.deepEqual(key.algorithm, { name: 'AES-GCM', length: 256 });
  await assert.rejects(webcrypto.subtle.exportKey('raw', key));
  const restored = await f.restart().handle({ type: 'settings.read' }, f.options);
  for (const [field, value] of Object.entries(credentials)) assert.equal(restored[field], value);
  assert.equal(restored.enabled, true);
});

test('Concurrent field saves preserve all values and toggles; clear deletes ciphertext and key', async () => {
  const f = fixture();
  await setup(f);
  const key = await f.keyOperation(store => store.get('credentials'));
  await Promise.all([
    f.send('settings.write', { field: 'username', value: 'edited-user' }),
    f.send('toggle', {}, f.popup),
    f.send('settings.write', { field: 'password', value: 'edited-password' }),
  ]);
  const saved = await f.send('settings.read');
  assert.equal(saved.username, 'edited-user'); assert.equal(saved.password, 'edited-password');
  assert.equal(saved.totp_uri, uri); assert.equal(saved.enabled, false);
  await f.send('settings.clear');
  assert.deepEqual(f.data, {});
  assert.equal(await f.keyOperation(store => store.get('credentials')), undefined);
  await setup(f);
  await assert.rejects(webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(f.data.vault.iv),
    additionalData: new TextEncoder().encode('purdue-sso:credentials:v1') }, key, new Uint8Array(f.data.vault.data)),
  'A fresh setup must use a new key');
});

test('Existing plaintext settings migrate before access; failed encryption writes preserve the original for retry', async () => {
  const f = fixture({ ...credentials, enabled: true });
  f.failWrite = true;
  await assert.rejects(f.send('settings.read'));
  assert.equal(f.data.password, credentials.password);
  assert.equal(f.data.vault, undefined);
  f.failWrite = false;
  assert.equal((await f.send('settings.read')).password, credentials.password);
  assert.deepEqual(Object.keys(f.data).sort(), ['enabled', 'vault']);
  assert.equal((await f.restart().handle({ type: 'status' }, f.popup)).ready, true);
});

test('Modified ciphertext, IV, version, and missing keys fail closed and remain clearable', async () => {
  for (const damage of ['ciphertext', 'iv', 'version', 'key']) {
    const f = fixture(); await setup(f);
    if (damage === 'ciphertext') f.data.vault.data[0] ^= 1;
    if (damage === 'iv') f.data.vault.iv[0] ^= 1;
    if (damage === 'version') f.data.vault.version = 99;
    if (damage === 'key') await f.keyOperation(store => store.delete('credentials'));
    const restarted = f.restart();
    await assert.rejects(restarted.handle({ type: 'login.config' }, f.content));
    await assert.rejects(restarted.handle({ type: 'settings.write', field: 'password', value: 'replacement' }, f.options));
    await restarted.handle({ type: 'settings.clear' }, f.options);
    assert.deepEqual(f.data, {});
  }
  const f = fixture({ ...credentials, vault: { version: 99 } });
  await assert.rejects(f.send('settings.read'));
  await f.send('settings.clear');
  assert.deepEqual(f.data, {}, 'Clear also recovers from a failed migration');
});

test('Broker limits credentials by sender, operation, enabled state, and settings revision', async () => {
  const f = fixture(); await setup(f);
  const status = await f.send('status', {}, f.popup);
  assert.deepEqual(status, { ready: true, enabled: true });
  const config = await f.send('login.config', {}, f.content);
  assert.equal(config.password, undefined); assert.equal(config.totp_uri, undefined);
  const revision = config.revision;
  assert.equal(await f.send('login.password', { revision }, f.content), credentials.password);
  const code = await f.send('login.code', { revision }, f.content);
  assert.equal(code.code, generateTotp(uri, code.expiresAt - 1));
  assert.ok(code.expiresAt > Date.now());
  for (const sender of [
    { ...f.options, id: 'another-extension' },
    { ...f.content, frameId: 1 },
    { ...f.content, tab: undefined },
    { ...f.content, url: 'http://sso.purdue.edu/login' },
    { ...f.content, url: 'https://sso.purdue.edu.evil.example/login' },
    { ...f.content, url: 'https://sso.purdue.edu:8443/login' },
    { ...f.content, url: 'https://example.com/' },
  ]) await assert.rejects(f.send('login.password', { revision }, sender));
  for (const sender of [f.content, f.popup]) {
    for (const type of ['settings.read', 'settings.write', 'settings.clear']) await assert.rejects(f.send(type, {}, sender));
  }
  await assert.rejects(f.send('toggle', {}, f.content));
  await assert.rejects(f.send('login.code', { revision }, { ...f.content, url: 'https://purdue.brightspace.com/d2l/login' }));
  await f.send('toggle', {}, f.popup);
  await assert.rejects(f.send('login.password', { revision }, f.content));
  await assert.rejects(f.send('login.code', { revision }, f.content));
  await f.send('toggle', {}, f.popup);
  await f.send('settings.write', { field: 'username', value: 'replacement' });
  await assert.rejects(f.send('login.password', { revision }, f.content));
  await assert.rejects(f.send('login.code', { revision }, f.content));
});

test('Failed writes do not replace the encrypted profile; invalid messages never write', async () => {
  const f = fixture(); await setup(f);
  const original = structuredClone(f.data);
  f.failWrite = true;
  await assert.rejects(f.send('settings.write', { field: 'password', value: 'replacement' }));
  assert.deepEqual(f.data, original);
  f.failWrite = false;
  for (const values of [{ field: 'enabled', value: 'true' }, { field: 'totp_uri', value: '123456' },
    { field: 'password', value: {} }, { field: 'unknown', value: 'value' }]) {
    await assert.rejects(f.send('settings.write', values));
  }
  assert.deepEqual(f.data, original);
});

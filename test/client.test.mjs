import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../extension/client.js', import.meta.url), 'utf8');
for (const apiName of ['chrome', 'browser']) {
  test(`Background message client handles replies and failures (${apiName} API)`, async () => {
    let response = { ok: true, value: { ready: true, enabled: false } };
    let sent;
    const context = vm.createContext({ [apiName]: { runtime: { async sendMessage(message) {
      sent = message;
      return response;
    } } } });
    vm.runInContext(source, context);
    assert.deepEqual(await context.PurdueSettings.request('status'), response.value);
    assert.equal(sent.type, 'status');
    response = { ok: false, error: 'Synthetic failure' };
    await assert.rejects(context.PurdueSettings.request('login.code', { revision: 'old' }), /Synthetic failure/);
    assert.equal(sent.revision, 'old');
    response = undefined;
    await assert.rejects(context.PurdueSettings.request('status'), /Could not access/);
  });
}

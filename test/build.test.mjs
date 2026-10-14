import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const build = (...targets) => execFileSync(process.execPath, ['scripts/build-extension.mjs', ...targets], {
  cwd: root, stdio: 'pipe',
});
const json = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));

test('Chrome and Firefox builds contain complete, identical code with target-specific manifests', async () => {
  build();
  const pkg = await json('package.json');
  const chrome = await json('dist/chrome/manifest.json');
  const firefox = await json('dist/firefox/manifest.json');
  assert.equal(chrome.version, pkg.version);
  assert.equal(firefox.version, pkg.version);
  assert.equal(chrome.browser_specific_settings, undefined);
  assert.equal(firefox.browser_specific_settings.gecko.id, 'purdue-sso@pmxi.github.io');
  assert.equal(firefox.browser_specific_settings.gecko.strict_min_version, '140.0');
  assert.deepEqual(firefox.browser_specific_settings.gecko.data_collection_permissions.required, ['authenticationInfo']);
  delete firefox.browser_specific_settings;
  assert.deepEqual(firefox, chrome, 'Only the Firefox metadata differs');

  const expected = ['content.js', 'manifest.json', 'options.html', 'options.js', 'popup.html', 'popup.js', 'totp.js'];
  for (const target of ['chrome', 'firefox']) {
    assert.deepEqual((await readdir(new URL(`dist/${target}/`, root))).sort(), expected);
    for (const name of expected.filter(name => name !== 'manifest.json')) {
      assert.equal(await readFile(new URL(`dist/${target}/${name}`, root), 'utf8'),
        await readFile(new URL(`extension/${name}`, root), 'utf8'));
    }
    const manifest = await json(`dist/${target}/manifest.json`);
    assert.deepEqual(manifest.content_scripts[0].js, ['totp.js', 'content.js']);
    for (const page of [manifest.options_page, manifest.action.default_popup]) {
      const html = await readFile(new URL(`dist/${target}/${page}`, root), 'utf8');
      for (const [, script] of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
        assert.ok(expected.includes(script), `Package contains ${script} referenced by ${page}`);
      }
    }
  }
  // Rebuilds remove leftovers instead of accidentally distributing stale files.
  await writeFile(new URL('dist/firefox/stale.txt', root), 'stale');
  build('firefox');
  assert.deepEqual((await readdir(new URL('dist/firefox/', root))).sort(), expected);
  assert.throws(() => build('../invalid'), /Usage:/, 'Reject unexpected output paths');
});

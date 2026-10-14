import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const targets = process.argv.slice(2);
if (!targets.length) targets.push('chrome', 'firefox');
if (targets.some(target => !['chrome', 'firefox'].includes(target))) {
  throw new Error('Usage: node scripts/build-extension.mjs [chrome|firefox]');
}
const base = JSON.parse(await readFile(new URL('extension/manifest.json', root), 'utf8'));
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
if (base.version !== pkg.version) throw new Error('Package and extension versions must match.');

for (const target of new Set(targets)) {
  const destination = new URL(`dist/${target}/`, root);
  const manifest = structuredClone(base);
  if (target === 'firefox') {
    manifest.browser_specific_settings = {
      gecko: {
        id: 'purdue-sso@pmxi.github.io',
        strict_min_version: '140.0',
        // Automatic submission sends credentials to Purdue/Microsoft forms.
        data_collection_permissions: { required: ['authenticationInfo'] },
      },
      gecko_android: { strict_min_version: '142.0' },
    };
  }
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  // Explicit allowlist keeps local files and development tools out of packages.
  for (const name of ['content.js', 'totp.js', 'options.js', 'options.html', 'popup.js', 'popup.html']) {
    await cp(new URL(`extension/${name}`, root), new URL(name, destination));
  }
  await writeFile(new URL('manifest.json', destination), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Built ${target}: ${fileURLToPath(destination)}`);
}

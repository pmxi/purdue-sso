import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const source = fileURLToPath(new URL('assets/icon.svg', root));
await mkdir(new URL('extension/icons/', root), { recursive: true });

// Supersample the vector before downscaling for smooth edges at toolbar sizes.
// PNGs are committed, so normal builds do not require ImageMagick.
for (const size of [16, 24, 32, 48, 64, 96, 128]) {
  const destination = fileURLToPath(new URL(`extension/icons/icon-${size}.png`, root));
  try {
    execFileSync('magick', [
      '-background', 'none', '-density', '576', source,
      '-resize', `${size}x${size}`, '-strip', '-define', 'png:exclude-chunk=date,time',
      `PNG32:${destination}`,
    ], { stdio: 'pipe' });
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('Install ImageMagick to regenerate icons (the magick command is required).');
    throw error;
  }
  console.log(`Rendered ${size}×${size}: ${destination}`);
}

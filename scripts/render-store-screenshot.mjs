import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const source = fileURLToPath(new URL('assets/chrome-screenshot-enabled.svg', root));
const destination = fileURLToPath(new URL('assets/chrome-screenshot-enabled.png', root));

// Render the editable vector at 3×, then downsample to the store's required size.
// PNG24 produces an opaque RGB PNG. The committed image needs no runtime tools.
try {
  execFileSync('magick', [
    '-background', '#f4f4f5', '-density', '288', source,
    '-resize', '1280x800', '-strip', '-define', 'png:exclude-chunk=date,time',
    `PNG24:${destination}`,
  ], { stdio: 'pipe' });
} catch (error) {
  if (error.code === 'ENOENT') throw new Error('Install ImageMagick to render the store screenshot (the magick command is required).');
  throw error;
}
console.log(`Rendered 1280×800 store screenshot: ${destination}`);

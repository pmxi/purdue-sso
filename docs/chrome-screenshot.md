# Chrome listing screenshot graphic

Asset: `assets/chrome-screenshot-enabled.png`.

Replaced October 16, 2026 with a vector illustration rendered from `assets/chrome-screenshot-enabled.svg`. No image-generation model or generated raster asset is used. The previous generated image has been replaced.

The popup layout, colors, labels, and icon paths follow the light-theme interface in `extension/popup.html`. The vector uses Arial/Helvetica text and a 2.5× view of the 240px popup. This is an illustration of its enabled state, not a live browser capture. It contains no credentials or personal information.

## Reproduce

Install ImageMagick, then run:

```sh
node scripts/render-store-screenshot.mjs
```

The script renders the SVG at 3× resolution and downsamples it to the Chrome Web Store's 1280 × 800, 24-bit RGB PNG format, without transparency. The image is committed, so normal extension builds do not need ImageMagick. The saved PNG was visually inspected and its dimensions and color format verified before upload.

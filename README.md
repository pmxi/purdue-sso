# Automatic Purdue sign-in

A browser extension for Chrome and Firefox that automates Purdue sign-in: campus and account selection, username, password, authenticator codes, and the “Stay signed in?” prompt. Automatic sign-in is off until you configure and enable it.

## Build and install

Requires Node.js 20 or newer. There are no runtime or build dependencies to install.

```sh
npm run build
```

This creates `dist/chrome` and `dist/firefox` from the shared `extension` source folder. Keep the generated folders in a stable location. Rebuild after source changes, reload the extension, and reload open sign-in tabs.

### Chrome

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select `dist/chrome`.
3. Open the extension popup and click **Set up**.

Chrome keeps the unpacked extension installed across restarts. After rebuilding, click **Reload** on its extension card.

### Firefox

Requires Firefox for desktop 142 or newer.

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose **Load Temporary Add-on** and select `dist/firefox/manifest.json`.
3. Open the extension popup and click **Set up**. Allow access to its declared sign-in sites if Firefox asks.

Click **Reload** in `about:debugging` after rebuilding. A temporary add-on is removed when Firefox restarts. For a persistent installation in standard Firefox, the extension needs to be packaged and signed by Mozilla, either for a public listing or unlisted self-distribution. This repository does not include a signed release. See Mozilla’s [temporary installation guide](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/) and [signing and distribution guide](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/).

For private windows, allow the extension in **Add-ons and themes → Automatic Purdue sign-in → Run in Private Windows**. Chrome has an equivalent **Allow in Incognito** switch on the extension’s details page.

## Configure

1. Enter your Purdue career account, password, and an authenticator setup key or existing `otpauth://totp/…` enrollment URI in **Settings**.
2. Choose your campus and enable automatic sign-in. Valid changes save automatically; check the save status before closing Settings.
3. Start at a Purdue service such as [Brightspace](https://purdue.brightspace.com). The bare `https://sso.purdue.edu/` address is not a login entry point.

To obtain a new setup key for an account that already has MFA, sign in at [Microsoft Security info](https://mysignins.microsoft.com/security-info) using your existing method. Choose **+ Add sign-in method → Microsoft Authenticator → Set up a different authenticator app → Can’t scan QR Code?** Copy the secret key into Settings and wait for the saved status. Use the displayed current code to verify the new method in Microsoft Security info. The code refreshes automatically, with a countdown until the next code. Keep your existing method until the new one works. Purdue describes this process in its [authentication code setup guide](https://service.purdue.edu/TDClient/32/Purdue/KB/Article/2219/How-To-Set-Up-Authentication-Codes-with-Yubikeys-for-Microsoft-MFA).

A current six-digit code is not the setup key. The extension does not enroll an authenticator or extract secrets from another app. It supports SHA-1, SHA-256, SHA-512, 6–8 digits, and custom periods.

The popup has one main button: **Enabled** (green) or **Disabled** (gray). Click it to toggle automatic sign-in in open login tabs. Your choice stays in effect until you change it. When disabled, use the website’s account controls to choose another account. The **Settings** button below the toggle opens your credentials and campus preferences at any time.

Text fields save after a short typing pause or when you leave the field. Campus and enable/disable changes save immediately. Incomplete or invalid values are not saved; the status explains what to fix. **Clear settings** removes saved values and cancels any pending edits.

The extension does not sign out, clear cookies, or change browser site data. Brightspace’s Log Out control may leave a Purdue SSO session active. If that prevents sign-in, use your browser’s site-data controls for the affected Purdue, Brightspace, and Microsoft sites.

## Behavior and permissions

- Runs only on HTTPS pages at `sso.purdue.edu`, `idp.purdue.edu`, `login.microsoftonline.com`, and `purdue.brightspace.com`, in the top-level page. Campus selection is limited to Brightspace’s `/d2l/login` page.
- On Microsoft, requires Purdue’s tenant, the configured account, or a recent continuation of that login. A different detected account prevents automation.
- Chooses password and verification-code alternatives, generates TOTP codes locally with Web Crypto, and checks “Don’t show this again” before choosing **Yes** on “Stay signed in?”.
- Preserves conflicting user-entered values, ignores hidden fields, and prevents duplicate submissions. Visible errors block form submission while recovery alternatives remain available. Rejected passwords and codes are not automatically resubmitted.
- Waits for a fresh code when fewer than five seconds remain. Stops after three minutes on a page. The enable/disable button takes effect in open login tabs. Changing or clearing credentials stops automation in those tabs until they are reloaded.
- Uses only the `storage` API permission for local settings. A background context handles encrypted settings and generates sign-in codes. No broad access to other sites is requested.

## Credential handling

The career account, password, authenticator enrollment, and campus are encrypted with AES-256-GCM before being written to local extension storage. Every write uses a fresh random 96-bit IV and a 128-bit authentication tag. A per-installation, non-exportable Web Crypto key is persisted in the extension's IndexedDB database. The enable/disable preference is stored separately; browser sync is not used. No unlock prompt or extra setup step is needed. Existing plaintext settings are encrypted and verified before their active plaintext entries are removed. Clear settings removes both ciphertext and key.

The key stays in the same browser profile. Non-exportable prevents raw-key export through Web Crypto; it is not an OS-bound or hardware-backed guarantee. Someone with access to that profile or a compromised device may still recover or use both the password and authenticator secret. This reduces the separation normally provided by two-factor authentication. Use a profile on a device you control and clear settings before sharing it. Keep credentials and authenticator secrets out of this repository, issues, and chats.

The extension enters and submits the saved username, password, and generated codes through Purdue/Microsoft’s normal sign-in forms. The background context retains the enrollment secret; sign-in scripts request generated codes, never the secret. Background requests check the extension sender, page URL, top-level frame, enabled state, and settings revision. Missing keys or damaged ciphertext stop access; there is no plaintext fallback. There is no telemetry, remote code, external library, or separate network request made by the extension. Session-storage markers contain timestamps, not credentials.

The Firefox manifest declares `authenticationInfo` because the extension submits authentication information to those websites. It uses Firefox’s [built-in data transmission disclosure](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/).

## Development

```sh
npm ci # test-only IndexedDB implementation
npm test
npm run check
npm run build
# Or build one target:
npm run build:chrome
npm run build:firefox
```

For Mozilla’s package validator, run `npx --yes web-ext lint --source-dir dist/firefox --warnings-as-errors` after building. This optional check downloads the validator; it is not required to build or run the extension.

| Path | Purpose |
| --- | --- |
| `extension/vault.js` | AES-GCM encryption and persistent non-exportable key storage |
| `extension/background.js` | Serialized settings operations and restricted credential messages |
| `extension/client.js` | Shared background-message client |
| `extension/content.js` | Sign-in flow, account guards, and live enable/disable handling |
| `extension/totp.js` | Shared authenticator parsing and code generation |
| `extension/options.*` | Settings and enrollment verification |
| `extension/popup.*` | Enable/disable button and Settings shortcut |
| `extension/manifest.json` | Shared Manifest V3 configuration |
| `assets/icon.svg` | Editable source for the black-and-gold sign-in icon |
| `extension/icons/` | Committed PNG icons used by both browsers |
| `scripts/build-extension.mjs` | Copies source files and sets Chrome service-worker / Firefox event-page manifests |
| `scripts/render-icons.mjs` | Regenerates PNG sizes from the SVG using ImageMagick |
| `test/` | Synthetic sign-in, UI, TOTP, API compatibility, and build tests |
| `dist/` | Generated installation folders; ignored by Git |

Edit files in `extension`, never generated files in `dist`. Both browsers use the same JavaScript, selecting Firefox’s `browser` API or Chrome’s `chrome` API. Keep the package and manifest versions aligned. Keep the Firefox add-on ID stable between releases so settings and updates retain their identity.

To change the icon, edit `assets/icon.svg`, install [ImageMagick](https://imagemagick.org/script/download.php) if needed, and run `npm run icons`. Commit the SVG and regenerated PNGs together, then rebuild. Normal builds use the committed PNGs and do not require ImageMagick.

Tests use synthetic credentials, public TOTP vectors, real Web Crypto, and a test-only IndexedDB implementation (`fake-indexeddb`). They cover encryption, restart recovery, migration, tampering, deletion, concurrent saves, and message authorization. They exercise both API namespaces and simulate login forms; they do not sign in to a real Purdue account. Browser login pages can change. This is an unofficial project, unaffiliated with Purdue or Microsoft.

## License and privacy

Released under the [MIT License](LICENSE). See the [privacy policy](PRIVACY.md) for credential storage, transmission, and deletion details.

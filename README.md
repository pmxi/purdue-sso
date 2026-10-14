# Purdue SSO

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
3. Open the extension popup and choose **Settings**.

Chrome keeps the unpacked extension installed across restarts. After rebuilding, click **Reload** on its extension card.

If upgrading from the previous Chrome-only folder, loading the new folder can create a separate installation with separate settings. Have your credentials and authenticator enrollment available privately, remove the old installation, and configure the new one. Do not run both copies together.

### Firefox

Requires Firefox for desktop 140 or newer.

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose **Load Temporary Add-on** and select `dist/firefox/manifest.json`.
3. Open the extension popup and choose **Settings**. Allow access to its declared sign-in sites if Firefox asks.

Click **Reload** in `about:debugging` after rebuilding. A temporary add-on is removed when Firefox restarts. For a persistent installation in standard Firefox, the extension needs to be packaged and signed by Mozilla, either for a public listing or unlisted self-distribution. This repository does not include a signed release. See Mozilla’s [temporary installation guide](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/) and [signing and distribution guide](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/).

For private windows, allow the extension in **Add-ons and themes → Purdue automatic sign-in → Run in Private Windows**. Chrome has an equivalent **Allow in Incognito** switch on the extension’s details page.

## Configure

1. Enter your Purdue career account, password, and an authenticator setup key or existing `otpauth://totp/…` enrollment URI in **Settings**.
2. Choose your campus, enable automatic sign-in, and save.
3. Start at a Purdue service such as [Brightspace](https://purdue.brightspace.com). The bare `https://sso.purdue.edu/` address is not a login entry point.

To obtain a new setup key for an account that already has MFA, sign in at [Microsoft Security info](https://mysignins.microsoft.com/security-info) using your existing method. Choose **+ Add sign-in method → Microsoft Authenticator → Set up a different authenticator app → Can’t scan QR Code?** Copy the secret key into Settings and save. Use the displayed current code to verify the new method in Microsoft Security info. Keep your existing method until the new one works. Purdue describes this process in its [authentication code setup guide](https://service.purdue.edu/TDClient/32/Purdue/KB/Article/2219/How-To-Set-Up-Authentication-Codes-with-Yubikeys-for-Microsoft-MFA).

A current six-digit code is not the setup key. The extension does not enroll an authenticator or extract secrets from another app. It supports SHA-1, SHA-256, SHA-512, 6–8 digits, and custom periods.

The popup can pause automatic sign-in for 15 minutes, 30 minutes, one hour, or until you resume. While paused, use the website’s account controls to choose another account. **Retry on this tab** clears the tab’s submission guards and reloads the sign-in page with your current settings; it does not override a pause.

The extension does not sign out, clear cookies, or change browser site data. Brightspace’s Log Out control may leave a Purdue SSO session active. If that prevents sign-in, use your browser’s site-data controls for the affected Purdue, Brightspace, and Microsoft sites.

## Behavior and permissions

- Runs only on HTTPS pages at `sso.purdue.edu`, `idp.purdue.edu`, `login.microsoftonline.com`, and `purdue.brightspace.com`, in the top-level page. Campus selection is limited to Brightspace’s `/d2l/login` page.
- On Microsoft, requires Purdue’s tenant, the configured account, or a recent continuation of that login. A different detected account prevents automation.
- Chooses password and verification-code alternatives, generates TOTP codes locally with Web Crypto, and checks “Don’t show this again” before choosing **Yes** on “Stay signed in?”.
- Preserves conflicting user-entered values, ignores hidden fields, and prevents duplicate submissions. Visible errors block form submission while recovery alternatives remain available. Rejected passwords and codes are not automatically resubmitted.
- Waits for a fresh code when fewer than five seconds remain. Stops after three minutes on a page. Changing or clearing settings stops automation in open tabs until they are reloaded.
- Uses `storage` for local settings and `activeTab` to retry the selected sign-in tab. It needs no background worker or broad access to other sites.

## Credential handling

Settings use local extension storage, not browser sync. The password and authenticator secret are stored together in the browser profile; someone with access to that profile may be able to read both. This reduces the separation normally provided by two-factor authentication. Use a profile on a device you control and clear settings before sharing it. Keep credentials and authenticator secrets out of this repository, issues, and chats.

The extension enters and submits the saved username, password, and generated codes through Purdue/Microsoft’s normal sign-in forms. The enrollment secret stays in the browser. There is no telemetry, remote code, external library, or separate network request made by the extension. Session-storage markers contain timestamps, not credentials.

The Firefox manifest declares `authenticationInfo` because the extension submits authentication information to those websites. It uses Firefox’s [built-in data transmission disclosure](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/).

## Development

```sh
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
| `extension/content.js` | Sign-in flow, account guards, pause and retry handling |
| `extension/totp.js` | Shared authenticator parsing and code generation |
| `extension/options.*` | Settings and enrollment verification |
| `extension/popup.*` | Pause, resume, settings, and retry controls |
| `extension/manifest.json` | Shared Manifest V3 configuration |
| `scripts/build-extension.mjs` | Copies source files and adds Firefox manifest metadata |
| `test/` | Synthetic sign-in, UI, TOTP, API compatibility, and build tests |
| `dist/` | Generated installation folders; ignored by Git |

Edit files in `extension`, never generated files in `dist`. Both browsers use the same JavaScript, selecting Firefox’s `browser` API or Chrome’s `chrome` API. Keep the package and manifest versions aligned. Keep the Firefox add-on ID stable between releases so settings and updates retain their identity.

Tests use synthetic credentials and public TOTP vectors. They exercise both API namespaces and simulate login forms; they do not sign in to a real Purdue account. Browser login pages can change. This is an unofficial project, unaffiliated with Purdue or Microsoft.

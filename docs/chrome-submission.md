# Chrome Web Store submission

Updated October 16, 2026 for version 1.1.2, **Automatic Purdue sign-in**. This version adds automatic AES-256-GCM encryption of saved credentials and a compatible background context for Chrome and Firefox. The Firefox release archive and `v1.1.0` tag remain unchanged.

## Status

- Uploaded to the Chrome Web Store on October 16, 2026 as a **Draft**. This is not a submission for review or an approved release.
- [Manage draft](https://chrome.google.com/webstore/devconsole/ff1a382b-328f-421e-b4cc-c4df094d8f2c/eddemecijgomibcpkealhgbchfiphcnc/edit/package). Item ID: `eddemecijgomibcpkealhgbchfiphcnc`.
- Publisher registration is complete. The publisher authorized the non-trader declaration, added and verified the public contact email, and chose the display name **Paras Mittal**.
- Saved the description, Tools category, English language, homepage/support URLs, store icon, and small promotional tile. Saved the single-purpose and permission explanations, no-remote-code declaration, and data categories: personally identifiable information, authentication information, and website content.
- Saved the reviewer instructions below. Distribution defaults are free of charge, public, and all regions; the item itself remains unpublished.
- On October 16, 2026, pushed the extension commits and `v1.1.0` tag to GitHub. The privacy policy is public at https://github.com/pmxi/purdue-sso/blob/main/PRIVACY.md and that URL is saved in the Chrome draft. Added a 1280 × 800 store screenshot graphic based on the publisher's popup capture.
- The previous Chrome 1.1.1 ZIP was built and verified: 15 files, with the manifest at the archive root. All 15 automated tests and JavaScript syntax checks pass. SHA-256: `ae081b59d91bd276483db171ac18cdddd970fcad9ca09a99c6c93a325da8d76d`.
- Version 1.1.2 is prepared with encrypted storage, automatic plaintext migration, restricted background messages, and updated privacy disclosures. All 23 tests and syntax checks pass. Both browser packages build, and Firefox validation reports 0 errors, warnings, or notices. The Chrome ZIP contains 18 files and has SHA-256 `163bc0c18316c3ebb42b003a58e4e58581851b8a5bc7615c919ba0b0b7bffd3d`. Store upload and submission are pending.
- Full sign-in testing requires an authorized Purdue account. No live test credentials are included in this repository or package.

## Listing fields

**Name:** Automatic Purdue sign-in

**Language:** English

**Category:** Productivity / Tools

**Homepage:** https://github.com/pmxi/purdue-sso

**Support:** https://github.com/pmxi/purdue-sso/issues

**Icon:** `extension/icons/icon-128.png`

**Small promotional tile:** `assets/chrome-promo.png` (440 × 280; editable source: `assets/chrome-promo.svg`).

**Screenshot:** `assets/chrome-screenshot-enabled.png` (1280 × 800, 24-bit RGB PNG), generated from the publisher's supplied capture of the enabled popup. Generation details and prompt: `docs/chrome-screenshot.md`.

**Privacy policy:** https://github.com/pmxi/purdue-sso/blob/main/PRIVACY.md

## Description

Reduce repeated typing when signing in to Purdue services such as Brightspace.

After you configure and enable it, Automatic Purdue sign-in selects your campus and account, fills your username and password, and generates and submits time-based authenticator codes locally. It can also choose Yes and Don't show this again on Microsoft's Stay signed in prompt.

• One button enables or disables automatic sign-in: green when enabled, gray when disabled.
• Settings save automatically, and the setup verification code refreshes with a countdown.
• Runs on the declared Purdue, Brightspace, and Microsoft sign-in sites.
• Stops on conflicting accounts and visible sign-in errors, and limits repeated submissions.
• No developer server, analytics, advertising, or telemetry.

Setup requires a Purdue account and an authenticator setup key or compatible otpauth enrollment URI. A current six-digit verification code is not a setup key. Follow the instructions in Settings to add and verify an authenticator method. Automatic sign-in starts disabled.

Credentials and the authenticator secret are encrypted with AES-256-GCM in your local browser profile. A non-exportable encryption key is stored in the same profile, so no extra unlock step is needed. This is not an operating-system or hardware-backed vault; someone with access to the profile or a compromised device may still recover or use the key and credentials. When enabled, the extension submits your username, password, and generated codes to Purdue/Microsoft's normal HTTPS sign-in forms. The setup key stays in the browser. You can disable automation or clear saved settings at any time.

This is an unofficial project, not affiliated with or endorsed by Purdue University or Microsoft. Login pages may change, and some account or authentication configurations may require manual sign-in.

## Privacy practices and permission explanations

**Single purpose:** Automate the standard Purdue sign-in flow for the account configured by the user, including campus and account selection, account credentials, and locally generated authenticator codes.

**Storage permission:** Save the user-entered career account, password, authenticator enrollment, and campus as AES-256-GCM ciphertext in local extension storage; save the enable/disable preference separately. A non-exportable key is kept in extension IndexedDB. Browser sync is not used.

**Site access:** Content scripts identify and fill the normal sign-in forms on `sso.purdue.edu`, `idp.purdue.edu`, `login.microsoftonline.com`, and `purdue.brightspace.com`. Brightspace automation is limited to its login page. Microsoft automation checks the Purdue tenant, configured account, or a recent continuation of that sign-in. Access to these pages is necessary for the extension's single purpose.

**Remote code:** None. All executable code is included in the extension package. No remotely hosted scripts, eval, or external runtime libraries are used.

Data-use declarations must reflect the username, authentication information, and sign-in page content and URLs used to recognize and complete the flow. Local processing must be disclosed; absence of developer-operated servers does not mean the extension handles no user data. Check the dashboard's definitions when filling its categories. The three limited-use disclosures match the implementation: no data sales, no unrelated use, and no creditworthiness or lending use.

## Reviewer testing instructions

The dashboard allows 500 characters. The following 447-character version was saved; the username/password fields were left empty because no live test account is available:

> Starts disabled. Open Settings. In an isolated profile, use a dummy username/password and otpauth://totp/Test?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ to test autosave, code countdown, popup, and Clear settings. Keep automation off on live sites with dummy values. Full login requires an authorized Purdue account with TOTP; start at https://purdue.brightspace.com. No live test account is available; please request a testing arrangement if needed.

Extended instructions for future supporting material:

The extension starts disabled. Open its popup and choose Set up or Settings. In an isolated test profile, use a synthetic career account and password and the public test-vector URI `otpauth://totp/Test?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ` to inspect setup, auto-save, countdown, popup controls, and Clear settings. Keep automation disabled on real sign-in sites when using these synthetic values.

For full sign-in testing, use a Purdue account authorized for a compatible TOTP method and start at https://purdue.brightspace.com. No live university test account is included. Request an appropriate testing arrangement if account access is necessary for review.

Run `npm test` and `npm run check` for synthetic tests and JavaScript syntax checks. Tests simulate sign-in-page DOMs; they do not establish a real Purdue session.

## Build and packaging

Node.js 20 or newer. The only dependency is used by tests and is excluded from packages:

```sh
npm ci
npm test
npm run check
npm run build:chrome
mkdir -p dist/packages
(cd dist/chrome && zip -X -r ../packages/purdue-sso-chrome-1.1.2.zip .)
```

The ZIP must have `manifest.json` at its root. Upload only the built extension, icons, and MIT license, excluding source tests, screenshots, local credentials, and development tools. The build script uses an explicit file allowlist.

The promotional PNG can be regenerated separately with ImageMagick:

```sh
magick -background none -density 288 assets/chrome-promo.svg -resize 440x280 -strip -define png:exclude-chunk=date,time PNG24:assets/chrome-promo.png
```

## References

- [Publish in the Chrome Web Store](https://developer.chrome.com/docs/webstore/publish)
- [Store listing fields and assets](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)
- [User data and secure handling FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)

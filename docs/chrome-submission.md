# Chrome Web Store draft

Prepared October 15, 2026 for version 1.1.1, **Automatic Purdue sign-in**. This version includes the rename and setup-instruction edits made after the Firefox 1.1.0 submission. The Firefox release archive and `v1.1.0` tag remain unchanged.

## Status

- Uploaded to the Chrome Web Store on October 16, 2026 as a **Draft**. This is not a submission for review or an approved release.
- [Manage draft](https://chrome.google.com/webstore/devconsole/ff1a382b-328f-421e-b4cc-c4df094d8f2c/eddemecijgomibcpkealhgbchfiphcnc/edit/package). Item ID: `eddemecijgomibcpkealhgbchfiphcnc`.
- Publisher registration is complete. The publisher authorized the non-trader declaration, added and verified the public contact email, and chose the display name **Paras Mittal**.
- Saved the description, Tools category, English language, homepage/support URLs, store icon, and small promotional tile. Saved the single-purpose and permission explanations, no-remote-code declaration, and data categories: personally identifiable information, authentication information, and website content.
- Saved the reviewer instructions below. Distribution defaults are free of charge, public, and all regions; the item itself remains unpublished.
- The Chrome 1.1.1 ZIP is built and verified: 15 files, with the manifest at the archive root. All 15 automated tests and JavaScript syntax checks pass. SHA-256: `ae081b59d91bd276483db171ac18cdddd970fcad9ca09a99c6c93a325da8d76d`.
- Before review: resolve storage of credentials and authenticator secrets at rest. The current implementation saves them in unencrypted `storage.local`; Google's secure-handling FAQ requires strong encryption at rest. No storage redesign has been chosen or implemented.
- Before review: publish the accurate privacy policy at a reachable public URL, complete the final data-use certifications, and supply a screenshot or video of the actual extension. These are the remaining dashboard requirements after contact-email verification. The local privacy policy is `PRIVACY.md`; do not enter an unpublished GitHub URL in the dashboard.
- Full sign-in testing requires an authorized Purdue account. No live test credentials are included in this repository or package.

## Listing fields

**Name:** Automatic Purdue sign-in

**Language:** English

**Category:** Productivity / Tools

**Homepage:** https://github.com/pmxi/purdue-sso

**Support:** https://github.com/pmxi/purdue-sso/issues

**Icon:** `extension/icons/icon-128.png`

**Small promotional tile:** `assets/chrome-promo.png` (440 × 280; editable source: `assets/chrome-promo.svg`).

## Description

Reduce repeated typing when signing in to Purdue services such as Brightspace.

After you configure and enable it, Automatic Purdue sign-in selects your campus and account, fills your username and password, and generates and submits time-based authenticator codes locally. It can also choose Yes and Don't show this again on Microsoft's Stay signed in prompt.

• One button enables or disables automatic sign-in: green when enabled, gray when disabled.
• Settings save automatically, and the setup verification code refreshes with a countdown.
• Runs on the declared Purdue, Brightspace, and Microsoft sign-in sites.
• Stops on conflicting accounts and visible sign-in errors, and limits repeated submissions.
• No developer server, analytics, advertising, or telemetry.

Setup requires a Purdue account and an authenticator setup key or compatible otpauth enrollment URI. A current six-digit verification code is not a setup key. Follow the instructions in Settings to add and verify an authenticator method. Automatic sign-in starts disabled.

The current draft stores credentials and the authenticator secret together in your local browser profile without additional extension-level encryption. Someone with access to that profile may be able to recover both. When enabled, the extension submits your username, password, and generated codes to Purdue/Microsoft's normal HTTPS sign-in forms. The setup key stays in the browser. You can disable automation or clear saved settings at any time.

This is an unofficial project, not affiliated with or endorsed by Purdue University or Microsoft. Login pages may change, and some account or authentication configurations may require manual sign-in.

## Privacy practices and permission explanations

**Single purpose:** Automate the standard Purdue sign-in flow for the account configured by the user, including campus and account selection, account credentials, and locally generated authenticator codes.

**Storage permission:** Save the user-entered career account, password, authenticator enrollment, campus, and enable/disable preference locally in this browser profile. Browser sync is not used.

**Site access:** Content scripts identify and fill the normal sign-in forms on `sso.purdue.edu`, `idp.purdue.edu`, `login.microsoftonline.com`, and `purdue.brightspace.com`. Brightspace automation is limited to its login page. Microsoft automation checks the Purdue tenant, configured account, or a recent continuation of that sign-in. Access to these pages is necessary for the extension's single purpose.

**Remote code:** None. All executable code is included in the extension package. No remotely hosted scripts, eval, or external runtime libraries are used.

Data-use declarations must reflect the username, authentication information, and sign-in page content and URLs used to recognize and complete the flow. Local processing must be disclosed; absence of developer-operated servers does not mean the extension handles no user data. Check the dashboard's definitions when filling its categories. Do not certify full policy compliance while the storage issue is unresolved.

## Reviewer testing instructions

The dashboard allows 500 characters. The following 447-character version was saved; the username/password fields were left empty because no live test account is available:

> Starts disabled. Open Settings. In an isolated profile, use a dummy username/password and otpauth://totp/Test?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ to test autosave, code countdown, popup, and Clear settings. Keep automation off on live sites with dummy values. Full login requires an authorized Purdue account with TOTP; start at https://purdue.brightspace.com. No live test account is available; please request a testing arrangement if needed.

Extended instructions for future supporting material:

The extension starts disabled. Open its popup and choose Set up or Settings. In an isolated test profile, use a synthetic career account and password and the public test-vector URI `otpauth://totp/Test?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ` to inspect setup, auto-save, countdown, popup controls, and Clear settings. Keep automation disabled on real sign-in sites when using these synthetic values.

For full sign-in testing, use a Purdue account authorized for a compatible TOTP method and start at https://purdue.brightspace.com. No live university test account is included. Request an appropriate testing arrangement if account access is necessary for review.

Run `npm test` and `npm run check` for synthetic tests and JavaScript syntax checks. Tests simulate sign-in-page DOMs; they do not establish a real Purdue session.

## Build and packaging

Node.js 20 or newer, with no dependencies to install:

```sh
npm test
npm run check
npm run build:chrome
mkdir -p dist/packages
(cd dist/chrome && zip -X -r ../packages/purdue-sso-chrome-1.1.1.zip .)
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

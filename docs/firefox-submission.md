# Firefox Add-ons submission

Submission record and materials for Firefox Add-ons. Version 1.1.0 was submitted on October 14, 2026 and approved on October 17, 2026. Version 1.1.3, submitted and approved October 30, 2026, adds the encrypted storage first released for Chrome in 1.1.2 and fixes verification-code entry when the account's default method is a text message, call, email or passkey. Version 1.1.4 adds a status box to the top of Settings (**Incomplete** with what is missing, **Ready**, **Disabled** or **Not saved**) and turns automatic sign-in on by default once setup is complete.

## Listing fields

The current display name is **Automatic Purdue sign-in**. Version 1.1.0 was submitted as **Purdue automatic sign-in**; its uploaded archives and Git tag retain that original name. The rename applies to the current source and listing, and will enter the installed extension in the next package submission. The existing add-on ID and listing URL stay the same.

**Name:** Automatic Purdue sign-in

**Listing slug:** purdue-automatic-sign-in

**Summary:** Unofficial Purdue sign-in helper that fills your account details and verification codes using settings saved in this browser.

**Category:** Other

**Homepage:** https://github.com/pmxi/purdue-sso

**Support website:** https://github.com/pmxi/purdue-sso/issues

**Platforms:** Firefox desktop on Windows, macOS, and Linux. Do not select Android for this initial release; mobile behavior has not been tested.

**License:** MIT, chosen by the publisher. The license is included in the source archive and built extension.

**Privacy policy:** Paste the content of `PRIVACY.md` into the listing's privacy-policy field. Do not use a GitHub file URL until that file has been published there.

## Description

Reduce repeated typing when signing in to Purdue services such as Brightspace.

Once you set it up, Automatic Purdue sign-in selects your campus and account, fills your username and password, and generates and submits time-based authenticator codes locally. It can also choose Yes and Don't show this again on Microsoft's Stay signed in prompt.

- One button enables or disables automatic sign-in: green when enabled, gray when disabled.
- Settings save automatically, and a status box shows whether setup is incomplete or ready.
- Runs only on the declared Purdue, Brightspace, and Microsoft sign-in sites.
- Stops on conflicting accounts and visible sign-in errors, and limits repeated submissions.
- No developer server, analytics, advertising, or telemetry.

Setup requires a Purdue account and an authenticator setup key or compatible otpauth enrollment URI. A current six-digit verification code is not a setup key. Follow the instructions in Settings to add and verify an authenticator method. Automatic sign-in turns on once setup is complete; you can turn it off from the popup at any time.

Credentials and the authenticator secret are encrypted with AES-256-GCM in your local browser profile. A non-exportable encryption key is stored in the same profile, so no extra unlock step is needed. This is not an operating-system or hardware-backed vault; someone with access to the profile or a compromised device may still recover or use the key and credentials. When enabled, the extension submits your username, password, and generated codes to Purdue/Microsoft's normal HTTPS sign-in forms. The setup key stays in the browser. You can disable automation or clear saved settings at any time.

Requires Firefox 142 or newer on desktop. This is an unofficial project, not affiliated with or endorsed by Purdue University or Microsoft. Login pages may change, and some account or authentication configurations may require manual sign-in.

## Notes for reviewers

Purpose: automate the normal sign-in sequence for a user-configured Purdue account. It does not enroll secrets or bypass server-side authentication.

The packaged JavaScript is the readable source. There is no minification, transpilation, bundler, third-party runtime library, remote executable code, or native application. A background event page (`background.js`) decrypts settings and generates codes; sign-in scripts never receive the authenticator secret. The source archive includes tests and the build script, which copies files and adds Firefox manifest metadata.

Permission use:

- `storage`: saves the user's settings locally as AES-256-GCM ciphertext, with a non-exportable key in extension IndexedDB. Browser sync is not used.
- Content-script matches: `https://sso.purdue.edu/*`, `https://idp.purdue.edu/*`, `https://login.microsoftonline.com/*`, and `https://purdue.brightspace.com/*`. Scripts run only in the top-level page. The Brightspace action is limited to `/d2l/login`; Microsoft automation checks Purdue's tenant, the configured account, or a recent continuation of that login.
- Required data transmission category `authenticationInfo`: the extension submits the user-provided account details and locally generated verification codes through the receiving websites' HTTPS login forms. The enrollment secret is not transmitted. Firefox's built-in data consent is used. Automation runs only after the user saves an account, password and authenticator key, and can be turned off from the popup.

Testing without a Purdue account:

1. Install the extension and open its popup. With no saved credentials, the button reads Set up. Click it or Settings to open the options page.
2. In an isolated test profile, enter a synthetic career account and password and the public test-vector URI `otpauth://totp/Test?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ`. Do not use these test values to submit a live sign-in form.
3. Check that valid settings save automatically, the status box at the top of Settings changes from Incomplete to Ready, the displayed verification code refreshes with a countdown, and the popup reflects enable/disable changes. Turn automation off in the popup before visiting real login services with synthetic settings.
4. Clear settings and verify that the setup state returns and the verification code disappears.
5. Run `npm test` in the source archive to exercise the sign-in flows, account and form safeguards, code generation, popup, options, and browser-specific builds with synthetic data. These tests simulate the website DOM; they do not establish a real Purdue session.

Testing the full login requires a Purdue account authorized to use a compatible TOTP method. Start at https://purdue.brightspace.com, not the bare SSO origin. No live university test account is included in this submission. If account access is necessary for review, please request an appropriate testing arrangement from the author; the source tests do not substitute for full live-site review.

Build: Node.js 20+, no runtime or build dependencies. From the source archive root, run npm ci (installs the test-only fake-indexeddb), npm test, npm run check, then npm run build:firefox. Output: dist/firefox. Full build instructions: docs/firefox-submission.md.

## Reproducing the Firefox build

Version 1.1.4 was prepared on macOS using Node.js 24.22.1. The build also supports Node.js 20 or newer on Linux and Windows and uses only Node's built-in modules. Tests use one development dependency, `fake-indexeddb`, installed by `npm ci`. PNG icons are included; regenerating icons is not part of the normal build.

From the root of the source archive:

```sh
npm ci
npm test
npm run check
npm run build:firefox
```

Compare the generated `dist/firefox` files with the contents of the uploaded extension ZIP. The manifest must be at the ZIP root.

The publisher can package and validate the build with Mozilla's optional tool:

```sh
npm exec --yes --package=web-ext -- web-ext build --source-dir dist/firefox --artifacts-dir dist/packages --filename purdue-sso-firefox-1.1.4.zip --overwrite-dest
npm exec --yes --package=web-ext -- web-ext lint --source-dir dist/firefox --warnings-as-errors
```

The distribution ZIP contains only built extension files and the MIT license. The source ZIP contains `extension`, `scripts`, `assets/icon.svg`, `test`, `package.json`, `package-lock.json`, `README.md`, `LICENSE`, `PRIVACY.md`, and this document. Neither archive should include `.git`, local browser data, credentials, `.env` files, or generated browser screenshots.

## Submission status

- Version 1.1.4 prepared on October 30, 2026 from tag `v1.1.4`. The description and reviewer notes above were updated for the enabled-by-default behavior.
- Version 1.1.3 submitted on October 30, 2026 (about 1:52 PM EDT) from tag `v1.1.3`, with release notes, reviewer notes and the matching source archive. Mozilla validated it with no errors or warnings. Mozilla emailed at 1:56 PM EDT that it passed automated screening and is tentatively approved; the public API reported 1.1.3 as the current public version at 10:48 PM EDT. A later human review may still request changes. Distribution ZIP SHA-256 `b075592368806689b2d0f756317168690ac0b5b53419fe2ef4a6a4d432932d9a`; source ZIP `3b11b4a17cc6e6b702086ea3e021aec4ca45bfbd8ef0e41d437f4059212e3289`. Rebuilding from the source archive reproduced `dist/firefox` exactly.
- Same day: replaced the listing's credential-storage paragraph with the encryption wording above, and replaced the listing privacy policy with the current `PRIVACY.md` (last updated October 16, 2026). The public privacy page was checked afterward.
- On October 15, 2026, the listing name, description, and privacy policy were updated to **Automatic Purdue sign-in**. Version 1.1.0 remains awaiting review with its original uploaded package.
- Version 1.1.0 submitted on October 14, 2026. Mozilla displayed **Version Submitted** and will email the publisher when it is published. The completion page says publication may take up to 24 hours, or longer for manual review.
- [Manage listing](https://addons.mozilla.org/en-US/developers/addon/purdue-automatic-sign-in/edit) · [Version 1.1.0](https://addons.mozilla.org/en-US/developers/addon/purdue-automatic-sign-in/versions/6578260)
- The distribution and matching source archives were uploaded. Rebuilding the source archive reproduced all 15 distribution files exactly. The uploaded source archive preserves the pre-submission copy of this status section.
- Distribution ZIP prepared; local Mozilla validation reports no errors or warnings.
- Publisher account has two-step authentication enabled. The publisher authorized acceptance of Mozilla's distribution agreement and policies on October 14, 2026; they have been accepted.
- MIT license selected by the publisher on October 14, 2026.
- At submission time, the public GitHub repository showed an older implementation; the matching source archive was supplied for review. The extension commits and original `v1.1.0` tag were pushed to GitHub on October 16, 2026. Current `main` includes later changes; use the tag or uploaded source archive to reproduce this Firefox release.
- Automated checks and these materials do not guarantee store approval. Credential-storage security and any required live-account review must be resolved before treating the extension as ready for general release.

## References

- [Submit an add-on](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/)
- [Source code submission](https://extensionworkshop.com/documentation/publish/source-code-submission/)
- [Add-on policies](https://extensionworkshop.com/documentation/publish/add-on-policies/)
- [Firefox built-in data consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)

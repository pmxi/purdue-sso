# Firefox Add-ons submission

Submission record and materials for version 1.1.0. Submitted to Mozilla on October 14, 2026; publication is pending. Submission does not indicate Mozilla approval.

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

After you configure and enable it, Automatic Purdue sign-in selects your campus and account, fills your username and password, and generates and submits time-based authenticator codes locally. It can also choose Yes and Don't show this again on Microsoft's Stay signed in prompt.

- One button enables or disables automatic sign-in: green when enabled, gray when disabled.
- Settings save automatically, and the setup verification code refreshes with a countdown.
- Runs only on the declared Purdue, Brightspace, and Microsoft sign-in sites.
- Stops on conflicting accounts and visible sign-in errors, and limits repeated submissions.
- No developer server, analytics, advertising, or telemetry.

Setup requires a Purdue account and an authenticator setup key or compatible otpauth enrollment URI. A current six-digit verification code is not a setup key. Follow the instructions in Settings to add and verify an authenticator method. Automatic sign-in starts disabled.

Credentials and the authenticator secret are stored together in your local browser profile without additional extension-level encryption. Someone with access to that profile may be able to recover both. When enabled, the extension submits your username, password, and generated codes to Purdue/Microsoft's normal HTTPS sign-in forms. The setup key stays in the browser. You can disable automation or clear saved settings at any time.

Requires Firefox 142 or newer on desktop. This is an unofficial project, not affiliated with or endorsed by Purdue University or Microsoft. Login pages may change, and some account or authentication configurations may require manual sign-in.

## Notes for reviewers

Purpose: automate the normal sign-in sequence for a user-configured Purdue account. It does not enroll secrets or bypass server-side authentication.

The packaged JavaScript is the readable source. There is no minification, transpilation, bundler, third-party runtime library, remote executable code, background worker, or native application. The source archive includes tests and the build script, which copies files and adds Firefox manifest metadata.

Permission use:

- `storage`: saves the user's settings locally. Browser sync is not used.
- Content-script matches: `https://sso.purdue.edu/*`, `https://idp.purdue.edu/*`, `https://login.microsoftonline.com/*`, and `https://purdue.brightspace.com/*`. Scripts run only in the top-level page. The Brightspace action is limited to `/d2l/login`; Microsoft automation checks Purdue's tenant, the configured account, or a recent continuation of that login.
- Required data transmission category `authenticationInfo`: the extension submits the user-provided account details and locally generated verification codes through the receiving websites' HTTPS login forms. The enrollment secret is not transmitted. Firefox's built-in data consent is used, and automation is separately disabled by default until the user enables it.

Testing without a Purdue account:

1. Install the extension and open its popup. With no saved credentials, the button reads Set up. Click it or Settings to open the options page.
2. In an isolated test profile, enter a synthetic career account and password and the public test-vector URI `otpauth://totp/Test?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ`. Do not use these test values to submit a live sign-in form.
3. Check that valid settings save automatically, the displayed verification code refreshes with a countdown, and the popup reflects enable/disable changes. Keep automation disabled when visiting real login services with synthetic settings.
4. Clear settings and verify that the setup state returns and the verification code disappears.
5. Run `npm test` in the source archive to exercise the sign-in flows, account and form safeguards, code generation, popup, options, and browser-specific builds with synthetic data. These tests simulate the website DOM; they do not establish a real Purdue session.

Testing the full login requires a Purdue account authorized to use a compatible TOTP method. Start at https://purdue.brightspace.com, not the bare SSO origin. No live university test account is included in this submission. If account access is necessary for review, please request an appropriate testing arrangement from the author; the source tests do not substitute for full live-site review.

Build: Node.js 20+, no dependencies. From the source archive root, run npm test, npm run check, then npm run build:firefox. Output: dist/firefox. Full build instructions: docs/firefox-submission.md.

## Reproducing the Firefox build

The release package was prepared on macOS using Node.js 24.18.0 and npm 12.0.2. The build also supports Node.js 20 or newer on Linux and Windows, uses only Node's built-in modules, and has no dependencies to install. PNG icons are included; regenerating icons is not part of the normal build.

From the root of the source archive:

```sh
npm test
npm run check
npm run build:firefox
```

Compare the generated `dist/firefox` files with the contents of the uploaded extension ZIP. The manifest must be at the ZIP root.

The publisher can package and validate the build with Mozilla's optional tool:

```sh
npm exec --yes --package=web-ext -- web-ext build --source-dir dist/firefox --artifacts-dir dist/packages --filename purdue-sso-firefox-1.1.0.zip --overwrite-dest
npm exec --yes --package=web-ext -- web-ext lint --source-dir dist/firefox --warnings-as-errors
```

The distribution ZIP contains only built extension files and the MIT license. The source ZIP contains `extension`, `scripts`, `assets`, `test`, `package.json`, `README.md`, `LICENSE`, `PRIVACY.md`, and this document. Neither archive should include `.git`, local browser data, credentials, `.env` files, or generated browser screenshots.

## Submission status

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

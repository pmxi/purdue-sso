# Purdue SSO

A Violentmonkey userscript and unpacked Chrome extension that automate Purdue sign-in: username, password, authenticator codes, and the “Stay signed in?” prompt.

## Chrome extension

1. Download or clone this repository. Keep the `chrome-extension` folder in a stable local location.
2. Open `chrome://extensions` in Chrome, turn on **Developer mode**, click **Load unpacked**, and select the `chrome-extension` folder.
3. Open **Purdue automatic sign-in → Details → Extension options**. Enter your career account, password, and an authenticator setup key or existing `otpauth://totp/…` enrollment URI. Select **Enable automatic sign-in** and save.
4. Start at a Purdue service such as [Brightspace](https://purdue.brightspace.com). The extension does not act on the bare `https://sso.purdue.edu/` page. If sign-in is interrupted, use **Retry on this tab** from the extension popup. To pause it, clear **Enable automatic sign-in** in its options and reload the sign-in page.

The unpacked extension stays installed while the folder remains in place. When updating the repository, click **Reload** on its card in `chrome://extensions`. The extension runs in the Chrome profile where you installed it, and only on its three declared HTTPS sign-in origins. It uses local extension storage, not Chrome Sync. No credentials or authenticator secrets belong in this repository.

To get a new setup key for a Purdue account that already has MFA, sign in at [Microsoft Security info](https://mysignins.microsoft.com/security-info) using your existing method. Choose **+ Add sign-in method → Microsoft Authenticator → Set up a different authenticator app → Can’t scan QR Code?** Copy the secret key into the extension options and save. Use the displayed current code to verify the new method in Microsoft Security info. Keep your existing method until the new method works. Purdue documents this flow in its [authentication code setup guide](https://service.purdue.edu/TDClient/32/Purdue/KB/Article/2219/How-To-Set-Up-Authentication-Codes-with-Yubikeys-for-Microsoft-MFA). Never put the key in an issue, PR, or chat.

## Violentmonkey userscript

1. Install [Violentmonkey](https://violentmonkey.github.io/get-it/).
2. Open [purdue-sso.user.js](https://raw.githubusercontent.com/pmxi/purdue-sso/main/purdue-sso.user.js) and install it. Alternatively, create a new script in Violentmonkey and paste the file's contents.
3. Open the installed script in Violentmonkey's editor. Fill in the three empty fields near the top:

   ```js
   const config = {
     username: 'your-career-account',
     password: 'your-password',
     totp_uri: 'your-existing-otpauth-uri',
   };
   ```

4. Save, then visit your Purdue service and begin its normal login flow.

The repository ships with **empty credentials** and does nothing until configured. Edit only the installed browser copy. Do not commit your configured copy or share an extension export containing it. Installing a newer copy may replace your edits; preserve your configuration privately before updating.

`totp_uri` must be an existing `otpauth://totp/...` enrollment URI containing the authenticator secret. A six-digit code is not the secret. The script does not enroll an authenticator or extract secrets from an authenticator app. SHA-1, SHA-256, SHA-512, 6–8 digits, and custom periods are supported.

For Firefox private windows, allow Violentmonkey under **Extensions and Themes → Violentmonkey → Run in Private Windows → Allow**. See [Firefox's instructions](https://support.mozilla.org/en-US/kb/extensions-private-browsing).

## Behavior

- Runs on `sso.purdue.edu`, `idp.purdue.edu`, and `login.microsoftonline.com`, over HTTPS and in the top-level page only.
- On Microsoft, requires Purdue's tenant, the configured account, or a recent continuation of that login. A different detected account prevents automation.
- Fills username/password, chooses “Use a verification code” instead of app approval, and generates a TOTP locally with Web Crypto.
- Checks “Don't show this again” and chooses **Yes** on “Stay signed in?”.
- Excludes hidden login fields, preserves conflicting user-entered values, and prevents duplicate submissions.
- Follows available password/code alternatives even when the previous authentication method reports an error. Errors block form submission while visible; the script keeps watching for recovery controls or a cleared message instead of permanently stopping. Rejected passwords and codes are not automatically resubmitted.
- Waits for a fresh authenticator code when the current code has fewer than five seconds left.
- Stops after three minutes on a single page. The Violentmonkey menu offers **pause/enable** and **retry sign-in**; retry clears the per-tab submission guard.

The bare `https://sso.purdue.edu/` address is not a login entry point. Start from the Purdue service you want to use, such as [Brightspace](https://purdue.brightspace.com).

## Credential handling

Both installation methods store the password and authenticator secret together in the local browser profile. Anyone who can access that profile can potentially read both. A Violentmonkey export can also contain the credentials. This reduces the separation normally provided by two-factor authentication. Use a Chrome profile on a device you control, and clear the extension settings before sharing the profile. The Chrome extension stores the settings in `chrome.storage.local`; the userscript stores them in its installed source code.

There are no external libraries, telemetry, or network requests made by either implementation. They fill the normal Purdue/Microsoft login forms. Their session-storage markers contain timestamps, not credentials. See the official [metadata](https://violentmonkey.github.io/api/metadata-block/) and [API](https://violentmonkey.github.io/api/gm/) documentation for the userscript.

## Development

Requires Node.js 20 or newer. No dependencies to install.

```sh
npm test
npm run check
npm run build:chrome
```

The Chrome content script is generated from the userscript's sign-in logic. Run `npm run build:chrome` after changing that logic and commit the generated file. `npm run check` verifies it is current.

Tests use synthetic credentials and public TOTP vectors. They cover TOTP generation, account guards, repeated submissions, input handling, the off-screen password field on Microsoft's username screen, the stay-signed-in checkbox/Yes sequence, and recovery through delayed authentication alternatives after an error. DOM tests simulate the forms; they do not sign in to a real account.

The password/MFA flow was exercised against Purdue's live Microsoft login in September 2026. Version 1.0.4 was installed in Firefox on Tuesday, September 22, 2026; a fresh private-window login reached the authenticated Brightspace homepage without manual credential or code entry. Error recovery also has synthetic regression coverage. Login pages can change; this is an unofficial project and is not affiliated with Purdue or Microsoft.

# Privacy policy for Automatic Purdue sign-in

Last updated: October 16, 2026

Automatic Purdue sign-in is an unofficial browser extension. It is not affiliated with Purdue University or Microsoft.

## Information stored in your browser

The extension saves the career account, password, authenticator setup key or enrollment URI, campus, and enable/disable preference that you enter in Settings. The career account, password, enrollment, and campus are encrypted together with AES-256-GCM before being saved in local extension storage. Each write uses a new random initialization vector. The enable/disable preference is stored separately. Browser sync is not used.

The extension automatically creates a non-exportable Web Crypto key and keeps it in its own IndexedDB database in this browser profile. Encryption and decryption require no unlock prompt. Non-exportable means extension code cannot export the raw key through the Web Crypto API; it does not mean the key is protected by a separate password, hardware security, or an operating-system credential store. Someone with access to the browser profile or a compromised device may still recover or use the key and credentials. Storing the password and authenticator secret together reduces the separation normally provided by two-factor authentication.

The background extension context decrypts settings when needed. The popup receives only setup and enable/disable status. The Settings page can display and edit the saved values. Sign-in scripts receive the account and campus, and request a password or generated verification code when needed; they do not receive the authenticator setup key. If an older version saved unencrypted settings, the extension encrypts and verifies them before removing their active plaintext entries. This does not erase older browser or device backups.

The extension also uses temporary timestamps in the sign-in websites' session storage to limit repeated form submissions and recognize a recent continuation of a Purdue login. Those markers contain timestamps, not credentials.

## How information is used and transmitted

Automatic sign-in is off until you enable it. When enabled, the extension reads the supported sign-in pages to identify login forms, the selected account, available authentication methods, and errors. It enters and submits your saved username, password, and locally generated verification codes through the normal HTTPS sign-in forms operated by Purdue and Microsoft. It also selects your configured campus and account and can choose Yes and Don't show this again on the Stay signed in prompt.

The extension runs on `sso.purdue.edu`, `idp.purdue.edu`, `login.microsoftonline.com`, and `purdue.brightspace.com`. Campus selection follows the sign-in links provided by Brightspace; the Purdue Global option can navigate to `campus.purdueglobal.edu`.

The authenticator setup key is used locally to generate time-based verification codes. The extension does not send the setup key to websites or the developer. The receiving sign-in services handle submitted usernames, passwords, and verification codes under their own policies.

The developer does not receive your credentials, authenticator secret, browsing history, or page content through the extension. The extension contains no analytics, advertising, telemetry, remote code, or developer-operated server connection. It does not sell user data.

## Your controls and deletion

You can disable automatic sign-in from the popup or Settings. Disabling it retains your saved settings but stops automatic form submission. Changes to credentials or campus stop automation in already-open sign-in tabs until those tabs are reloaded.

Use Clear settings to remove the encrypted settings, enable/disable preference, and stored encryption key. Reload or close open sign-in tabs afterward to discard credentials already held in those tabs' memory. Clearing extension settings does not sign you out of Purdue or Microsoft, delete their cookies, or revoke an authenticator enrollment. Manage those separately through the relevant websites and browser controls.

Settings remain in the browser profile until you change or clear them. Browser or device backups may retain copies according to your own backup settings. The developer has no copy of these local settings to retrieve or delete.

## Support

For questions about the extension or this policy, use the project's issue tracker: <https://github.com/pmxi/purdue-sso/issues>. Issues are public; do not include passwords, setup keys, verification codes, or other private account information. Information you voluntarily post there is handled by GitHub and is separate from the extension's operation.

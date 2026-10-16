import './totp.js';
import { createVault } from './vault.js';

const { validTotpUri, generateTotp } = globalThis.PurdueTotp;
const configured = settings => !!(settings.username?.trim() && settings.password && validTotpUri(settings.totp_uri || ''));

export function createHandler(api, vault = createVault(api.storage.local)) {
  let queue = Promise.resolve();
  let initialized = false;
  function serial(operation, initializeFirst = true) {
    const result = queue.then(async () => {
      if (!initialized && initializeFirst) { await vault.migrate(); initialized = true; }
      return operation();
    });
    queue = result.catch(() => {});
    return result;
  }
  const initialize = () => serial(() => {});

  function handle(message, sender) {
    if (sender.id !== api.runtime.id) return Promise.reject(new Error('Unauthorized request'));
    const options = sender.url === api.runtime.getURL('options.html');
    const popup = sender.url === api.runtime.getURL('popup.html');
    let host;
    try {
      const url = new URL(sender.url);
      if (sender.tab && sender.frameId === 0 && url.protocol === 'https:' && !url.port
        && ['sso.purdue.edu', 'idp.purdue.edu', 'login.microsoftonline.com', 'purdue.brightspace.com'].includes(url.hostname)) {
        host = url.hostname;
      }
    } catch { /* Unrecognized senders cannot access credentials. */ }
    const type = message?.type;
    const allowed = (options && ['settings.read', 'settings.write', 'settings.clear'].includes(type))
      || ((options || popup) && ['status', 'toggle'].includes(type))
      || (host && ['login.config', 'login.password', 'login.code'].includes(type));
    if (!allowed) return Promise.reject(new Error('Unauthorized request'));
    if (type === 'settings.clear') return serial(async () => {
      await vault.clear();
      initialized = true;
      return null;
    }, false);
    return serial(async () => {
      const settings = await vault.read();
      if (type === 'settings.read') return settings;
      if (type === 'status') return { ready: configured(settings), enabled: settings.enabled };
      if (type === 'toggle') {
        if (!configured(settings)) throw new Error('Setup required');
        await api.storage.local.set({ enabled: !settings.enabled });
        return null;
      }
      if (type === 'settings.write') {
        const { field, value } = message;
        if (field === 'enabled' && typeof value === 'boolean') {
          await api.storage.local.set({ enabled: value });
        } else {
          if (!['username', 'password', 'totp_uri', 'campus'].includes(field)
            || typeof value !== 'string' || !value.trim() || value.length > 16_384
            || (field === 'totp_uri' && !validTotpUri(value))) throw new Error('Invalid setting');
          await vault.write({ ...settings, [field]: value });
        }
        return null;
      }
      if (type === 'login.config') return {
        username: settings.username, campus: settings.campus, enabled: settings.enabled,
        ready: configured(settings), revision: settings.revision,
      };
      if (!settings.enabled || !configured(settings) || message.revision !== settings.revision
        || host === 'purdue.brightspace.com') throw new Error('Sign-in unavailable');
      if (type === 'login.password') return settings.password;
      const now = Date.now();
      const period = Number(new URL(settings.totp_uri).searchParams.get('period') || 30) * 1000;
      return { code: await generateTotp(settings.totp_uri, now), expiresAt: (Math.floor(now / period) + 1) * period };
    });
  }
  return { handle, initialize };
}

const api = globalThis.browser ?? globalThis.chrome;
if (api) {
  const handler = createHandler(api);
  api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handler.handle(message, sender).then(value => sendResponse({ ok: true, value }),
      () => sendResponse({ ok: false, error: 'Could not access saved settings. Try again or clear settings.' }));
    return true;
  });
  // Register synchronously so suspended background contexts can wake for requests.
  api.runtime.onInstalled.addListener(() => { void handler.initialize().catch(() => {}); });
  api.runtime.onStartup.addListener(() => { void handler.initialize().catch(() => {}); });
}

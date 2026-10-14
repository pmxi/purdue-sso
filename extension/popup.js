const extensionApi = globalThis.browser ?? globalThis.chrome;
const toggle = document.querySelector('#toggle');
const state = document.querySelector('#state');
const fields = ['enabled', 'username', 'password', 'totp_uri'];
let saving = false;

function configured(settings) {
  return !!(settings.username?.trim() && settings.password && settings.totp_uri);
}

async function refresh() {
  const settings = await extensionApi.storage.local.get(fields);
  const ready = configured(settings);
  const enabled = ready && settings.enabled === true;
  state.textContent = ready ? enabled ? 'Enabled' : 'Disabled' : 'Set up';
  toggle.dataset.enabled = String(enabled);
  toggle.title = ready ? enabled ? 'Disable automatic sign-in' : 'Enable automatic sign-in' : 'Set up automatic sign-in';
  toggle.setAttribute('aria-label', ready ? 'Automatic sign-in' : 'Set up automatic sign-in');
  if (ready) {
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-checked', String(enabled));
  } else {
    toggle.removeAttribute('role');
    toggle.removeAttribute('aria-checked');
  }
}

function showError() {
  state.textContent = 'Try again';
  toggle.title = 'Could not update automatic sign-in. Click to try again.';
}

document.querySelector('#settings').addEventListener('click', () => extensionApi.runtime.openOptionsPage());

toggle.addEventListener('click', async () => {
  if (saving) return;
  saving = true;
  toggle.disabled = true;
  try {
    const settings = await extensionApi.storage.local.get(fields);
    if (!configured(settings)) {
      await extensionApi.runtime.openOptionsPage();
    } else {
      await extensionApi.storage.local.set({ enabled: settings.enabled !== true });
      await refresh();
    }
  } catch {
    showError();
  } finally {
    saving = false;
    toggle.disabled = false;
  }
});

extensionApi.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && !saving && fields.some(field => changes[field])) {
    void refresh().catch(showError);
  }
});
refresh().catch(showError).finally(() => { toggle.disabled = false; });

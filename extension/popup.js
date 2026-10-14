const extensionApi = globalThis.browser ?? globalThis.chrome;
const status = document.querySelector('#status');
const state = document.querySelector('#pause-state');
const resume = document.querySelector('#resume');

async function showPauseState() {
  const { manual_pause_until: until = 0, enabled, username, password, totp_uri: secret } =
    await extensionApi.storage.local.get(['manual_pause_until', 'enabled', 'username', 'password', 'totp_uri']);
  const paused = until === -1 || until > Date.now();
  state.textContent = paused ? until === -1
    ? 'Manual sign-in is on until you resume.'
    : `Manual sign-in is on until ${new Date(until).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`
    : enabled && username && password && secret
      ? 'Automatic sign-in is on.' : 'Finish setup in Settings to use automatic sign-in.';
  resume.hidden = !paused;
}

document.querySelector('#pause').addEventListener('click', async () => {
  const choice = document.querySelector('#pause-length').value;
  const until = choice === 'until-resumed' ? -1 : Date.now() + Number(choice) * 60_000;
  await extensionApi.storage.local.set({ manual_pause_until: until });
  status.textContent = 'Manual sign-in is ready. Choose accounts on the website.';
  await showPauseState();
});

resume.addEventListener('click', async () => {
  await extensionApi.storage.local.remove('manual_pause_until');
  status.textContent = 'Automatic sign-in resumed.';
  await showPauseState();
});

document.querySelector('#settings').addEventListener('click', () => extensionApi.runtime.openOptionsPage());
document.querySelector('#retry').addEventListener('click', async () => {
  const [tab] = await extensionApi.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/(?:sso|idp)\.purdue\.edu\/|^https:\/\/login\.microsoftonline\.com\/|^https:\/\/purdue\.brightspace\.com\//.test(tab.url || '')) {
    status.textContent = 'Open a Purdue sign-in tab first.';
    return;
  }
  try {
    await extensionApi.tabs.sendMessage(tab.id, 'retry-sign-in');
    status.textContent = 'Retrying sign-in.';
  } catch {
    status.textContent = 'Reload this tab after saving your settings.';
  }
});

extensionApi.storage.onChanged.addListener(() => { void showPauseState(); });
void showPauseState();

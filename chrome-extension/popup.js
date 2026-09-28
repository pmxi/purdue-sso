const status = document.querySelector('#status');
const state = document.querySelector('#mode-state');
const question = document.querySelector('#manual-question');
const modeButtons = ['#automatic', '#switch', '#manual', '#manual-signout', '#signout']
  .map(selector => document.querySelector(selector));
let starting = false;

function setBusy(busy) {
  for (const button of modeButtons) button.disabled = busy;
}

async function showMode() {
  const { manual_pause_until: until = 0, auth_flow: flow, enabled,
    username, password, totp_uri: secret } = await chrome.storage.local.get([
    'manual_pause_until', 'auth_flow', 'enabled', 'username', 'password', 'totp_uri',
  ]);
  setBusy(starting || flow?.phase === 'logging-out' || flow?.phase === 'microsoft');
  if (flow?.phase === 'error') state.textContent = flow.version === chrome.runtime.getManifest().version
    ? `Sign-out stopped: ${flow.error}`
    : 'A previous sign-out attempt stopped. Choose a mode to continue.';
  else if (flow?.phase === 'signed-out') state.textContent = 'Signed out. Choose regular automatic sign-in when ready.';
  else if (flow?.kind === 'switch') state.textContent = flow.phase === 'choosing'
    ? 'Choose an account. Automatic sign-in will continue only for your saved account.'
    : 'Switching accounts: signing out first.';
  else if (flow?.phase === 'logging-out' || flow?.phase === 'microsoft') state.textContent = 'Signing out.';
  else if (until === -1) state.textContent = 'Complete manual is on until you choose automatic.';
  else if (until > Date.now()) state.textContent = `Complete manual is on until ${new Date(until).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`;
  else state.textContent = enabled && username && password && secret
    ? 'Regular automatic sign-in is on.' : 'Finish setup in Settings to use automatic sign-in.';
}

async function runAction(action) {
  if (starting) return;
  starting = true;
  setBusy(true);
  try {
    await action();
  } catch {
    status.textContent = 'The action could not finish. Reload the extension and try again.';
  } finally {
    starting = false;
    await showMode();
  }
}

async function performFlow(kind) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) { status.textContent = 'Open a browser tab and try again.'; return; }
  status.textContent = 'Signing out…';
  const result = await chrome.runtime.sendMessage({ type: 'start-flow', kind,
    source: { id: tab.id, url: tab.url || '' } });
  status.textContent = result?.ok ? 'Sign-out started.' : result?.error || 'Sign-out could not start.';
}

const startFlow = kind => runAction(() => performFlow(kind));

document.querySelector('#automatic').addEventListener('click', () => runAction(async () => {
  const config = await chrome.storage.local.get(['username', 'password', 'totp_uri']);
  if (!config.username || !config.password || !config.totp_uri) {
    status.textContent = 'Finish setup in Settings first.';
    return;
  }
  await chrome.storage.local.set({ enabled: true });
  await chrome.storage.local.remove(['manual_pause_until', 'auth_flow']);
  question.hidden = true;
  status.textContent = 'Regular automatic sign-in is on.';
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id && /^https:\/\/(?:sso|idp)\.purdue\.edu\/|^https:\/\/login\.microsoftonline\.com\/|^https:\/\/purdue\.brightspace\.com\//.test(tab.url || '')) {
    await chrome.tabs.reload(tab.id);
  }
}));

document.querySelector('#switch').addEventListener('click', () => runAction(async () => {
  const config = await chrome.storage.local.get(['enabled', 'username', 'password', 'totp_uri']);
  if (!config.enabled || !config.username || !config.password || !config.totp_uri) {
    status.textContent = 'Finish setup in Settings before switching accounts.';
    return;
  }
  await chrome.storage.local.remove('manual_pause_until');
  question.hidden = true;
  await performFlow('switch');
}));

document.querySelector('#manual').addEventListener('click', () => runAction(async () => {
  const choice = document.querySelector('#manual-length').value;
  const until = choice === 'until-resumed' ? -1 : Date.now() + Number(choice) * 60_000;
  await chrome.storage.local.set({ manual_pause_until: until });
  await chrome.storage.local.remove('auth_flow');
  question.hidden = false;
  status.textContent = '';
}));

document.querySelector('#manual-signout').addEventListener('click', async () => {
  if (starting) return;
  question.hidden = true;
  await startFlow('manual');
});
document.querySelector('#manual-stay').addEventListener('click', () => {
  question.hidden = true;
  status.textContent = 'Complete manual is on. You remain signed in.';
});
document.querySelector('#signout').addEventListener('click', () => startFlow('logout'));
document.querySelector('#settings').addEventListener('click', () => chrome.runtime.openOptionsPage());

document.querySelector('#retry').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/(?:sso|idp)\.purdue\.edu\/|^https:\/\/login\.microsoftonline\.com\/|^https:\/\/purdue\.brightspace\.com\//.test(tab.url || '')) {
    status.textContent = 'Open a Purdue sign-in tab first.';
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, 'retry-sign-in');
    status.textContent = 'Retrying sign-in.';
  } catch {
    status.textContent = 'Reload this tab after saving your settings.';
  }
});

chrome.storage.onChanged.addListener(() => { void showMode(); });
void showMode();

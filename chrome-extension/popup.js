document.querySelector('#settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
const status = document.querySelector('#status');
const state = document.querySelector('#pause-state');
const resume = document.querySelector('#resume');
const signout = document.querySelector('#signout');

async function showPauseState() {
  const { manual_pause_until: until = 0 } = await chrome.storage.local.get('manual_pause_until');
  const active = until === -1 || until > Date.now();
  state.textContent = !active ? 'Automatic sign-in is on.' : until === -1
    ? 'Manual sign-in is on until you resume.'
    : `Manual sign-in is on until ${new Date(until).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`;
  resume.hidden = !active;
  signout.hidden = !active;
}

document.querySelector('#pause').addEventListener('click', async () => {
  const choice = document.querySelector('#pause-length').value;
  const until = choice === 'until-resumed' ? -1 : Date.now() + Number(choice) * 60_000;
  await chrome.storage.local.set({ manual_pause_until: until });
  status.textContent = 'Manual sign-in is ready. Sign out below if you want to switch accounts now.';
  await showPauseState();
});

resume.addEventListener('click', async () => {
  await chrome.storage.local.remove('manual_pause_until');
  status.textContent = 'Automatic sign-in resumed.';
  await showPauseState();
});

signout.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/purdue\.brightspace\.com\//.test(tab.url || '')) {
    status.textContent = 'Open a signed-in Brightspace tab, then use this button.';
    return;
  }
  try {
    const found = await chrome.tabs.sendMessage(tab.id, 'sign-out-brightspace');
    if (!found) {
      status.textContent = 'Use the Log Out item in the Brightspace account menu, then open Microsoft sign-out.';
      return;
    }
    await chrome.tabs.create({
      url: 'https://login.microsoftonline.com/4130bd39-7c53-419c-b1e5-8758d6d63f21/oauth2/v2.0/logout',
    });
    status.textContent = 'Complete Microsoft sign-out if prompted, then return to Brightspace.';
  } catch {
    status.textContent = 'Reload Brightspace, then try signing out again.';
  }
});

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

void showPauseState();

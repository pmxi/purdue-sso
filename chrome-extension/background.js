const MICROSOFT_LOGOUT = 'https://login.microsoftonline.com/4130bd39-7c53-419c-b1e5-8758d6d63f21/oauth2/v2.0/logout';
const BRIGHTSPACE_LOGIN = 'https://purdue.brightspace.com/d2l/login';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function flowIsCurrent(id) {
  const { auth_flow: flow } = await chrome.storage.local.get('auth_flow');
  return flow?.id === id;
}

function brightspace(url) {
  try { return new URL(url).origin === 'https://purdue.brightspace.com'; }
  catch { return false; }
}

async function waitForPage(tabId, predicate) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const tab = await chrome.tabs.get(tabId);
    if (predicate(tab)) return tab;
    await wait(250);
  }
  throw new Error('Brightspace did not finish signing out.');
}

async function signOutBrightspace(source) {
  const tabs = await chrome.tabs.query({ url: 'https://purdue.brightspace.com/*' });
  let tab = tabs.find(item => item.id === source.id && !new URL(item.url).pathname.startsWith('/d2l/login'))
    || tabs.find(item => !new URL(item.url).pathname.startsWith('/d2l/login'));
  if (!tab) {
    tab = await chrome.tabs.create({ url: 'https://purdue.brightspace.com/d2l/home/6824', active: false });
    tab = await waitForPage(tab.id, item => item.status === 'complete');
  }
  if (!brightspace(tab.url)) return tab.id;
  if (new URL(tab.url).pathname.startsWith('/d2l/login')) return tab.id;
  let clicked = false;
  try { clicked = await chrome.tabs.sendMessage(tab.id, 'sign-out-brightspace'); }
  catch { /* Reload once if this tab predates the installed content script. */ }
  if (!clicked) {
    await chrome.tabs.reload(tab.id);
    await waitForPage(tab.id, item => item.status === 'complete' && brightspace(item.url));
    clicked = await chrome.tabs.sendMessage(tab.id, 'sign-out-brightspace');
  }
  if (!clicked) throw new Error('Brightspace could not open its Log Out control.');
  await waitForPage(tab.id, item => brightspace(item.url)
    && new URL(item.url).pathname.startsWith('/d2l/login'));
  return tab.id;
}

async function startFlow(kind, source) {
  if (!['switch', 'manual', 'logout'].includes(kind)) throw new Error('Unknown sign-out action.');
  const flow = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    kind, phase: 'logging-out', sourceTabId: source.id, sourceUrl: source.url || '',
  };
  await chrome.storage.local.set({ auth_flow: flow });
  try {
    flow.brightspaceTabId = await signOutBrightspace(source);
    if (!await flowIsCurrent(flow.id)) return { ok: false, error: 'Sign-out was canceled.' };
    flow.phase = 'microsoft';
    await chrome.storage.local.set({ auth_flow: flow });
    const logoutTab = await chrome.tabs.create({ url: 'about:blank', active: true });
    flow.logoutTabId = logoutTab.id;
    if (!await flowIsCurrent(flow.id)) {
      await chrome.tabs.remove(logoutTab.id);
      return { ok: false, error: 'Sign-out was canceled.' };
    }
    await chrome.storage.local.set({ auth_flow: flow });
    await chrome.tabs.update(logoutTab.id, { url: MICROSOFT_LOGOUT });
    return { ok: true };
  } catch (error) {
    if (await flowIsCurrent(flow.id)) {
      await chrome.storage.local.set({ auth_flow: { ...flow, phase: 'error', error: error.message } });
    }
    return { ok: false, error: error.message };
  }
}

async function finishFlow(flow, logoutTabId) {
  if (!await flowIsCurrent(flow.id)) return;
  if (flow.kind === 'switch') {
    await chrome.storage.local.set({ auth_flow: { ...flow, phase: 'choosing' } });
  } else if (flow.kind === 'manual') {
    await chrome.storage.local.remove('auth_flow');
  } else {
    await chrome.storage.local.set({ auth_flow: { ...flow, phase: 'signed-out' } });
  }
  const sameService = /^https:\/\/(?:purdue\.brightspace\.com|sso\.purdue\.edu|idp\.purdue\.edu)\//.test(flow.sourceUrl);
  const url = flow.kind === 'logout' ? `${BRIGHTSPACE_LOGIN}?logout=1`
    : sameService ? flow.sourceUrl : BRIGHTSPACE_LOGIN;
  const targetId = sameService ? flow.sourceTabId : flow.brightspaceTabId;
  try { await chrome.tabs.update(targetId, { url, active: true }); }
  catch { await chrome.tabs.create({ url, active: true }); }
  if (logoutTabId && logoutTabId !== targetId) await chrome.tabs.remove(logoutTabId).catch(() => {});
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'start-flow') {
    void startFlow(message.kind, message.source).then(sendResponse);
    return true;
  }
  if (message?.type === 'microsoft-signed-out') {
    void chrome.storage.local.get('auth_flow').then(async ({ auth_flow: flow }) => {
      if (!flow || flow.id !== message.flowId || flow.phase !== 'microsoft'
        || sender.tab?.id !== flow.logoutTabId) return;
      try { await finishFlow(flow, sender.tab.id); }
      catch (error) {
        if (await flowIsCurrent(flow.id)) {
          await chrome.storage.local.set({ auth_flow: { ...flow, phase: 'error', error: error.message } });
        }
      }
    });
  }
});

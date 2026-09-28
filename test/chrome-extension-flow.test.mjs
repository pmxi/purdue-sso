import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const content = await readFile(new URL('../chrome-extension/content.js', import.meta.url), 'utf8');
const popup = await readFile(new URL('../chrome-extension/popup.js', import.meta.url), 'utf8');
const popupHtml = await readFile(new URL('../chrome-extension/popup.html', import.meta.url), 'utf8');
const uri = 'otpauth://totp/Test?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

function element(text, onClick = () => {}) {
  return {
    innerText: text, textContent: text, value: '',
    getAttribute: () => null, closest: () => null, getClientRects: () => [{}], click: onClick,
  };
}

async function contentPage({ hostname, pathname, body, campus, enabled = true, manualPause = 0,
  rows = [], controls = [], blocks = [], navigation = [], brand = false, avatar = null,
  authFlow = null, identities = [] }) {
  const changes = [];
  const messages = [];
  const writes = [];
  const notices = [];
  const session = new Map();
  const page = vm.createContext({
    URL, console, Date, setTimeout(callback) { callback(); return 1; }, clearTimeout() {},
    setInterval: () => 1, clearInterval() {},
    location: { protocol: 'https:', hostname, pathname, href: `https://${hostname}${pathname}`,
      assign(url) { navigation.push(url); }, reload() {} },
    sessionStorage: {
      getItem: key => session.get(key), setItem: (key, value) => session.set(key, value),
    },
    getComputedStyle: () => ({ visibility: 'visible' }),
    document: {
      body: { innerText: body },
      querySelector: selector => selector.startsWith('d2l-labs-navigation-dropdown-button-custom')
        ? avatar : brand ? element('Purdue University') : null,
      createElement: () => {
        let links = [];
        return {
          content: { querySelectorAll: () => links },
          set innerHTML(markup) {
            links = Array.from(markup.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi), ([, href, label]) => {
              const link = element(label.replace('&#160;', '\u00a0'));
              link.getAttribute = () => href.replaceAll('&amp;', '&');
              return link;
            });
          },
        };
      },
      querySelectorAll(selector) {
        if (selector === 'd2l-html-block[html]') return blocks;
        if (selector.startsWith('#displayName')) return identities;
        if (selector === 'button, a, [role="button"]'
          || selector === 'button, a, input[type="submit"], [role="button"]') return controls;
        if (selector === 'button, a, [role="button"], [data-test-id], .table') return rows;
        return [];
      },
    },
    chrome: {
      storage: {
        local: {
          async get() { return { username: 'test', password: 'dummy', totp_uri: uri,
            enabled, campus, manual_pause_until: manualPause, auth_flow: authFlow }; },
          async set(value) { writes.push(value); },
          async remove(key) { writes.push({ remove: key }); },
        },
        onChanged: { addListener(listener) { changes.push(listener); } },
      },
      runtime: { onMessage: { addListener(listener) { messages.push(listener); } },
        async sendMessage(message) { notices.push(message); } },
    },
  });
  await vm.runInContext(content, page);
  return { changes, messages, writes, notices };
}

{
  const clicked = [];
  const link = element(' Purdue West Lafayette / Indianapolis', () => clicked.push('west'));
  const block = { shadowRoot: { querySelectorAll: () => [link] }, getAttribute: () => '' };
  await contentPage({ hostname: 'purdue.brightspace.com', pathname: '/d2l/login',
    body: 'Please choose your campus', campus: 'Purdue West Lafayette / Indianapolis', blocks: [block] });
  assert.deepEqual(clicked, ['west'], 'Find Brightspace campus links inside a component shadow root');
}

{
  const navigation = [];
  const html = '<a rel="noopener" style="display: block" href="https://purdue.brightspace.com/d2l/lp/auth/saml/initiate-login?entityId=https://idp.purdue.edu/idp/shibboleth&amp;target=%2fd2l%2fhome%2f1643449" title="Purdue West Lafayette Login">&#160;Purdue West Lafayette / Indianapolis</a>';
  const block = { shadowRoot: null, getAttribute: () => html };
  await contentPage({ hostname: 'purdue.brightspace.com', pathname: '/d2l/login',
    body: 'Please choose your campus', campus: 'Purdue West Lafayette / Indianapolis',
    blocks: [block], navigation });
  assert.deepEqual(navigation, [
    'https://purdue.brightspace.com/d2l/lp/auth/saml/initiate-login?entityId=https://idp.purdue.edu/idp/shibboleth&target=%2fd2l%2fhome%2f1643449',
  ], 'Use the campus URL stored on the component when its shadow root is closed');
}

{
  const navigation = [];
  const html = '<a href="https://example.com/collect">&#160;Purdue West Lafayette / Indianapolis</a>';
  const block = { shadowRoot: null, getAttribute: () => html };
  await contentPage({ hostname: 'purdue.brightspace.com', pathname: '/d2l/login',
    body: 'Please choose your campus', campus: 'Purdue West Lafayette / Indianapolis',
    blocks: [block], navigation });
  assert.deepEqual(navigation, [], 'Never follow an unrelated stored campus URL');
}

{
  const clicked = [];
  const controls = [element('Log Out', () => clicked.push('logout'))];
  const { messages } = await contentPage({ hostname: 'purdue.brightspace.com',
    pathname: '/d2l/home/6824', body: 'Brightspace home', enabled: false, controls });
  const result = await new Promise(resolve => messages[0]('sign-out-brightspace', null, resolve));
  assert.equal(result, true);
  assert.deepEqual(clicked, ['logout'], 'Explicit sign-out works when automatic sign-in is disabled');
}

{
  const clicked = [];
  let open = false;
  const logout = element('Log Out', () => clicked.push('logout'));
  logout.getClientRects = () => open ? [{}] : [];
  const avatar = { shadowRoot: { querySelector: () => element('avatar', () => { open = true; }) } };
  const { messages } = await contentPage({ hostname: 'purdue.brightspace.com',
    pathname: '/d2l/home/6824', body: 'Brightspace home', controls: [logout], avatar });
  const result = await new Promise(resolve => messages[0]('sign-out-brightspace', null, resolve));
  assert.equal(result, true);
  assert.deepEqual(clicked, ['logout'], 'Open the live shadow-root avatar menu and click Log Out');
}

{
  const clicked = [];
  const controls = [
    element('Purdue West Lafayette /\nIndianapolis', () => clicked.push('west')),
    element('Purdue Fort Wayne', () => clicked.push('fort-wayne')),
  ];
  await contentPage({ hostname: 'purdue.brightspace.com', pathname: '/d2l/login',
    body: 'Please choose your campus', campus: 'Purdue Fort Wayne', controls });
  assert.deepEqual(clicked, ['fort-wayne'], 'Select only the configured campus');
}

{
  const clicked = [];
  const controls = [element('Purdue West Lafayette /\nIndianapolis', () => clicked.push('west'))];
  const { changes } = await contentPage({ hostname: 'purdue.brightspace.com', pathname: '/d2l/login',
    body: 'Please choose your campus', campus: 'Purdue West Lafayette / Indianapolis',
    manualPause: -1, controls });
  assert.deepEqual(clicked, [], 'Permanent manual pause stops the campus click');
  await new Promise(resolve => setImmediate(resolve));
  changes[0]({ manual_pause_until: { newValue: 0 } }, 'local');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(clicked, ['west'], 'Resuming starts automatic sign-in on the current page');
}

{
  const clicked = [];
  const controls = [element('Purdue West Lafayette / Indianapolis', () => clicked.push('west'))];
  const { changes } = await contentPage({ hostname: 'purdue.brightspace.com', pathname: '/d2l/login',
    body: 'Please choose your campus', campus: 'Purdue West Lafayette / Indianapolis',
    manualPause: -1, authFlow: { id: 'manual-1', kind: 'manual', phase: 'logging-out' }, controls });
  await new Promise(resolve => setImmediate(resolve));
  changes[0]({ auth_flow: { newValue: null } }, 'local');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(clicked, [], 'Completing logout must not cancel a permanent manual pause');
}

{
  const clicked = [];
  const rows = [
    element('Elliot Leo Drel\ntest@purdue.edu\nSigned in', () => clicked.push('elliot')),
    element('BuildPurdue\nother@purdue.edu\nSigned in', () => clicked.push('other')),
  ];
  await contentPage({ hostname: 'login.microsoftonline.com', pathname: '/common/login',
    body: 'Purdue University\nPick an account', brand: true, rows });
  assert.deepEqual(clicked, ['elliot'], 'Choose only the configured account on Purdue picker');
  clicked.length = 0;
  await contentPage({ hostname: 'login.microsoftonline.com', pathname: '/common/login',
    body: 'Pick an account', rows });
  assert.deepEqual(clicked, [], 'Ignore a generic Microsoft account picker');
}

{
  const clicked = [];
  const flow = { id: 'switch-1', kind: 'switch', phase: 'choosing' };
  const rows = [element('Elliot\ntest@purdue.edu', () => clicked.push('saved')),
    element('Other\nother@purdue.edu', () => clicked.push('other'))];
  await contentPage({ hostname: 'login.microsoftonline.com', pathname: '/common/login',
    body: 'Purdue University\nPick an account', brand: true, rows, authFlow: flow });
  assert.deepEqual(clicked, [], 'Switch accounts stops at the account picker');
  const own = element('test@purdue.edu'); own.value = 'test@purdue.edu';
  const ownPage = await contentPage({ hostname: 'login.microsoftonline.com', pathname: '/common/login',
    body: 'Enter your password', authFlow: flow, identities: [own] });
  assert.ok(ownPage.writes.some(value => value.remove === 'auth_flow'),
    'Choosing the configured account resumes automation');
  const other = element('other@purdue.edu'); other.value = 'other@purdue.edu';
  const otherPage = await contentPage({ hostname: 'login.microsoftonline.com', pathname: '/common/login',
    body: 'Enter your password', authFlow: flow, identities: [other] });
  assert.ok(otherPage.writes.some(value => value.auth_flow?.phase === 'other'),
    'Choosing another account leaves that sign-in manual');
}

{
  const clicked = [];
  const flow = { id: 'logout-1', kind: 'logout', phase: 'microsoft' };
  const rows = [element('Sign out test@purdue.edu work or school account.', () => clicked.push('saved'))];
  await contentPage({ hostname: 'login.microsoftonline.com', pathname: '/4130bd39-7c53-419c-b1e5-8758d6d63f21/oauth2/v2.0/logout',
    body: 'Pick an account\nWhich account do you want to sign out of?', rows, authFlow: flow });
  assert.deepEqual(clicked, ['saved'], 'Sign out the configured Microsoft account without another click');
  const donePage = await contentPage({ hostname: 'login.microsoftonline.com', pathname: '/logoutsession',
    body: 'You signed out of your account', authFlow: flow });
  assert.equal(donePage.notices.length, 1);
  assert.equal(donePage.notices[0].type, 'microsoft-signed-out');
  assert.equal(donePage.notices[0].flowId, 'logout-1');
}

{
  const listeners = {};
  const store = { manual_pause_until: 0, enabled: true, username: 'test', password: 'dummy', totp_uri: uri };
  const requests = [];
  let queryGate;
  const nodes = Object.fromEntries(['automatic', 'switch', 'manual', 'manual-length',
    'manual-question', 'manual-signout', 'manual-stay', 'signout', 'settings', 'retry', 'mode-state', 'status']
    .map(id => [id, { hidden: id === 'manual-question', textContent: '', value: '15',
      addEventListener(type, handler) { listeners[id] = handler; } }]));
  const page = vm.createContext({
    Date: class extends Date { static now() { return 1_000_000; } },
    document: { querySelector: selector => nodes[selector.slice(1)] },
    chrome: {
      storage: {
        local: {
          async get() { return { ...store }; },
          async set(value) { Object.assign(store, value); },
          async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete store[key]; },
        },
        onChanged: { addListener() {} },
      },
      runtime: { openOptionsPage() {}, async sendMessage(request) { requests.push(request); return { ok: true }; } },
      tabs: {
        async query() {
          if (queryGate) await queryGate;
          return [{ id: 7, url: 'https://purdue.brightspace.com/d2l/home/6824' }];
        },
        async sendMessage() { return true; },
        async reload() {},
      },
    },
  });
  await vm.runInContext(popup, page);
  assert.match(popupHtml, /<button id="signout">Sign out<\/button>/);
  assert.equal(nodes.signout.hidden, false, 'General sign-out is always available');
  await listeners.manual();
  assert.equal(store.manual_pause_until, 1_900_000);
  assert.equal(nodes['manual-question'].hidden, false, 'Complete manual asks about logout');
  assert.deepEqual(requests, [], 'Complete manual does not sign out without a yes');
  listeners['manual-stay']();
  assert.equal(nodes['manual-question'].hidden, true);
  await listeners.manual();
  await listeners['manual-signout']();
  assert.equal(requests[0].kind, 'manual');
  assert.equal(store.manual_pause_until, 1_900_000, 'Manual pause survives logout');
  await listeners.signout();
  assert.equal(requests[1].kind, 'logout', 'General sign-out is independent of manual mode');
  await listeners.switch();
  assert.equal(store.manual_pause_until, undefined, 'Switching keeps automatic sign-in enabled');
  assert.equal(requests[2].kind, 'switch');
  nodes['manual-length'].value = 'until-resumed';
  await listeners.manual();
  assert.equal(store.manual_pause_until, -1);
  await listeners.automatic();
  assert.equal(store.manual_pause_until, undefined);
  let releaseQuery;
  queryGate = new Promise(resolve => { releaseQuery = resolve; });
  const firstSignout = listeners.signout();
  const secondSignout = listeners.signout();
  assert.equal(nodes.signout.disabled, true, 'Mode controls disable before the tab query resolves');
  releaseQuery();
  await Promise.all([firstSignout, secondSignout]);
  assert.equal(requests.length, 4, 'Rapid repeated clicks start only one sign-out');
}

console.log('Passed: campus, account picker, sign-out controls, switch flow, and manual confirmation.');

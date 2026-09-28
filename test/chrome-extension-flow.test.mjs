import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const content = await readFile(new URL('../chrome-extension/content.js', import.meta.url), 'utf8');
const popup = await readFile(new URL('../chrome-extension/popup.js', import.meta.url), 'utf8');
const uri = 'otpauth://totp/Test?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

function element(text, onClick = () => {}) {
  return {
    innerText: text, textContent: text, value: '',
    getAttribute: () => null, closest: () => null, getClientRects: () => [{}], click: onClick,
  };
}

async function contentPage({ hostname, pathname, body, campus, enabled = true, manualPause = 0,
  rows = [], controls = [], blocks = [], navigation = [], brand = false }) {
  const changes = [];
  const messages = [];
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
      querySelector: () => brand ? element('Purdue University') : null,
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
        if (selector === 'button, a, [role="button"]'
          || selector === 'button, a, input[type="submit"], [role="button"]') return controls;
        if (selector === 'button, a, [role="button"], [data-test-id], .table') return rows;
        return [];
      },
    },
    chrome: {
      storage: {
        local: { async get() { return { username: 'test', password: 'dummy', totp_uri: uri,
          enabled, campus, manual_pause_until: manualPause }; } },
        onChanged: { addListener(listener) { changes.push(listener); } },
      },
      runtime: { onMessage: { addListener(listener) { messages.push(listener); } } },
    },
  });
  await vm.runInContext(content, page);
  return { changes, messages };
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
  changes[0]({ manual_pause_until: { newValue: 0 } }, 'local');
  assert.deepEqual(clicked, ['west'], 'Resuming starts automatic sign-in on the current page');
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
  const listeners = {};
  const store = {};
  const tabActions = [];
  const nodes = Object.fromEntries(['settings', 'retry', 'pause', 'resume', 'signout', 'pause-state', 'status', 'pause-length']
    .map(id => [id, { hidden: true, textContent: '', value: '15', addEventListener(type, handler) { listeners[id] = handler; } }]));
  const page = vm.createContext({
    Date: class extends Date { static now() { return 1_000_000; } },
    document: { querySelector: selector => nodes[selector.slice(1)] },
    chrome: {
      storage: { local: {
        async get() { return { manual_pause_until: store.until || 0 }; },
        async set(value) { store.until = value.manual_pause_until; },
        async remove() { store.until = 0; },
      } },
      runtime: { openOptionsPage() {} },
      tabs: {
        async query() { return [{ id: 7, url: 'https://purdue.brightspace.com/d2l/home/6824' }]; },
        async sendMessage(id, message) { tabActions.push([id, message]); return true; },
        async create(value) { tabActions.push(value.url); },
      },
    },
  });
  await vm.runInContext(popup, page);
  await listeners.pause();
  assert.equal(store.until, 1_900_000);
  assert.equal(nodes.signout.hidden, false, 'Offer sign-out after a pause');
  await listeners.signout();
  assert.deepEqual(tabActions, [
    [7, 'sign-out-brightspace'],
    'https://login.microsoftonline.com/4130bd39-7c53-419c-b1e5-8758d6d63f21/oauth2/v2.0/logout',
  ], 'Start Brightspace logout before Microsoft logout');
  nodes['pause-length'].value = 'until-resumed';
  await listeners.pause();
  assert.equal(store.until, -1);
  await listeners.resume();
  assert.equal(store.until, 0);
  assert.equal(nodes.signout.hidden, true);
}

console.log('Passed: configured campus, exact Purdue account, manual pause, resume, and sign-out offer.');

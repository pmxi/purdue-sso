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

async function contentPage({ hostname, pathname, body, campus, manualPause = 0,
  rows = [], controls = [], blocks = [], navigation = [], brand = false, recentPurdueContext = false }) {
  const changes = [];
  const page = vm.createContext({
    URL, console, Date, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
    location: { protocol: 'https:', hostname, pathname, href: `https://${hostname}${pathname}`,
      assign(url) { navigation.push(url); }, reload() {} },
    sessionStorage: { getItem: key => recentPurdueContext && key === 'purdue-autologin:context'
      ? String(Date.now()) : null, setItem() {} },
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
          enabled: true, campus, manual_pause_until: manualPause }; } },
        onChanged: { addListener(listener) { changes.push(listener); } },
      },
      runtime: { onMessage: { addListener() {} } },
    },
  });
  await vm.runInContext(content, page);
  return { changes };
}

{
  const clicked = [];
  const link = element(' Purdue West Lafayette / Indianapolis', () => clicked.push('west'));
  const block = { shadowRoot: { querySelectorAll: () => [link] }, getAttribute: () => '' };
  await contentPage({ hostname: 'purdue.brightspace.com', pathname: '/d2l/login',
    body: 'Please choose your campus', campus: 'Purdue West Lafayette / Indianapolis', blocks: [block] });
  assert.deepEqual(clicked, ['west'], 'Select the saved campus from Brightspace');
}

{
  const navigation = [];
  const html = '<a href="https://purdue.brightspace.com/d2l/lp/auth/saml/initiate-login?target=%2fd2l%2fhome">&#160;Purdue West Lafayette / Indianapolis</a>';
  const block = { shadowRoot: null, getAttribute: () => html };
  await contentPage({ hostname: 'purdue.brightspace.com', pathname: '/d2l/login',
    body: 'Please choose your campus', campus: 'Purdue West Lafayette / Indianapolis',
    blocks: [block], navigation });
  assert.equal(navigation.length, 1, 'Use the stored Brightspace campus link when its shadow root is closed');
  block.getAttribute = () => '<a href="https://example.com/collect">&#160;Purdue West Lafayette / Indianapolis</a>';
  navigation.length = 0;
  await contentPage({ hostname: 'purdue.brightspace.com', pathname: '/d2l/login',
    body: 'Please choose your campus', campus: 'Purdue West Lafayette / Indianapolis',
    blocks: [block], navigation });
  assert.deepEqual(navigation, [], 'Ignore an unrelated stored campus URL');
}

{
  const clicked = [];
  const controls = [element('Purdue West Lafayette / Indianapolis', () => clicked.push('west'))];
  const { changes } = await contentPage({ hostname: 'purdue.brightspace.com', pathname: '/d2l/login',
    body: 'Please choose your campus', campus: 'Purdue West Lafayette / Indianapolis',
    manualPause: -1, controls });
  assert.deepEqual(clicked, [], 'Manual pause stops campus selection');
  changes[0]({ manual_pause_until: { newValue: 0 } }, 'local');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(clicked, ['west'], 'Resuming starts sign-in on the current page');
}

{
  const clicked = [];
  const rows = [element('Elliot\ntest@purdue.edu', () => clicked.push('saved')),
    element('Other\nother@purdue.edu', () => clicked.push('other'))];
  await contentPage({ hostname: 'login.microsoftonline.com', pathname: '/common/login',
    body: 'Purdue University\nPick an account', brand: true, rows });
  assert.deepEqual(clicked, ['saved'], 'Choose only the saved account on a Purdue picker');
  clicked.length = 0;
  await contentPage({ hostname: 'login.microsoftonline.com', pathname: '/common/login',
    body: 'Pick an account', rows, recentPurdueContext: true });
  assert.deepEqual(clicked, [], 'Leave a generic Outlook picker alone even after Purdue sign-in in the same tab');
}

{
  const listeners = {};
  const store = { manual_pause_until: 0, enabled: true, username: 'test', password: 'dummy', totp_uri: uri };
  const nodes = Object.fromEntries(['pause', 'resume', 'pause-length', 'settings', 'retry', 'pause-state', 'status']
    .map(id => [id, { hidden: id === 'resume', textContent: '', value: '15',
      addEventListener(_type, handler) { listeners[id] = handler; } }]));
  const page = vm.createContext({
    Date: class extends Date { static now() { return 1_000_000; } },
    document: { querySelector: selector => nodes[selector.slice(1)] },
    chrome: {
      storage: { local: {
        async get() { return { ...store }; },
        async set(value) { Object.assign(store, value); },
        async remove(key) { delete store[key]; },
      }, onChanged: { addListener() {} } },
      runtime: { openOptionsPage() {} },
      tabs: { async query() { return []; } },
    },
  });
  await vm.runInContext(popup, page);
  assert.doesNotMatch(popupHtml, /id="(?:switch|signout|manual-signout)"/);
  await listeners.pause();
  assert.equal(store.manual_pause_until, 1_900_000);
  assert.equal(nodes.resume.hidden, false);
  await listeners.resume();
  assert.equal(store.manual_pause_until, undefined);
  nodes['pause-length'].value = 'until-resumed';
  await listeners.pause();
  assert.equal(store.manual_pause_until, -1);
}

console.log('Passed: campus, Purdue account picker, manual pause, and simplified popup.');

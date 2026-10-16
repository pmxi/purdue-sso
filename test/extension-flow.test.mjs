import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

for (const apiName of ['chrome', 'browser']) {
  test(`Campus, account and enable/disable flows (${apiName} API)`, async () => {
    const totpSource = await readFile(new URL('../extension/totp.js', import.meta.url), 'utf8');
    const content = totpSource + '\n' + await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');
    const uri = 'otpauth://totp/Test?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

    function element(text, onClick = () => {}) {
      return {
        innerText: text, textContent: text, value: '',
        getAttribute: () => null, closest: () => null, getClientRects: () => [{}], click: onClick,
      };
    }

    async function contentPage({ hostname, pathname, body, campus, enabled = true,
      rows = [], controls = [], blocks = [], navigation = [], brand = false, recentPurdueContext = false,
      session = {} }) {
      const changes = [];
      let interval;
      const page = vm.createContext({
        URL, console, Date, setInterval: callback => { interval = callback; return 1; }, clearInterval() { interval = undefined; },
        location: { protocol: 'https:', hostname, pathname, href: `https://${hostname}${pathname}`,
          assign(url) { navigation.push(url); } },
        sessionStorage: Object.assign(session, {
          getItem: key => recentPurdueContext && key === 'purdue-autologin:context'
            ? String(Date.now()) : session[key] ?? null,
          setItem: (key, value) => { session[key] = value; },
          removeItem: key => { delete session[key]; },
        }),
        getComputedStyle: () => ({ visibility: 'visible' }),
        DOMParser: class {
          parseFromString(markup) {
            const links = Array.from(markup.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi), ([, href, label]) => {
              const link = element(label.replace('&#160;', '\u00a0'));
              link.getAttribute = () => href.replaceAll('&amp;', '&');
              return link;
            });
            return { querySelectorAll: () => links };
          }
        },
        document: {
          body: { innerText: body },
          querySelector: () => brand ? element('Purdue University') : null,
          querySelectorAll(selector) {
            if (selector === 'd2l-html-block[html]') return blocks;
            if (selector === 'button, a, [role="button"]'
              || selector === 'button, a, input[type="submit"], [role="button"]') return controls;
            if (selector === 'button, a, [role="button"], [data-test-id], .table') return rows;
            return [];
          },
        },
        PurdueSettings: { async request(type) {
          assert.equal(type, 'login.config');
          return { username: 'test', ready: true, enabled, campus, revision: 'test' };
        } },
        [apiName]: {
          storage: {
            local: { async get(keys) {
              const saved = { username: 'test', password: 'dummy', totp_uri: uri, enabled, campus };
              return Object.fromEntries(keys.filter(key => key in saved).map(key => [key, saved[key]]));
            } },
            onChanged: { addListener(listener) { changes.push(listener); } },
          },
        },
      });
      await vm.runInContext(content, page);
      return { changes, poll: () => interval?.() };
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
        body: 'Please choose your campus', enabled: false, controls });
      assert.deepEqual(clicked, [], 'Disabled means no campus selection');
      changes[0]({ enabled: { oldValue: false, newValue: true } }, 'local');
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(clicked, ['west'], 'Enabling starts sign-in in the current page without a reload');
      changes[0]({ enabled: { oldValue: true, newValue: false } }, 'local');
      changes[0]({ enabled: { oldValue: false, newValue: true } }, 'local');
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(clicked, ['west'], 'Toggling preserves duplicate-submission guards');
    }

    {
      const clicked = [];
      const controls = [];
      const { changes, poll } = await contentPage({ hostname: 'purdue.brightspace.com', pathname: '/d2l/login',
        body: 'Please choose your campus', controls });
      changes[0]({ enabled: { oldValue: true, newValue: false } }, 'local');
      controls.push(element('Purdue West Lafayette / Indianapolis', () => clicked.push('west')));
      poll();
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(clicked, [], 'Disabling stops an already running page');
      changes[0]({ enabled: { oldValue: false, newValue: true } }, 'local');
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(clicked, ['west']);
    }

    {
      for (const key of ['vault', 'username', 'password', 'totp_uri', 'campus']) {
        const clicked = [];
        const controls = [element('Purdue West Lafayette / Indianapolis', () => clicked.push('west'))];
        const { changes } = await contentPage({ hostname: 'purdue.brightspace.com', pathname: '/d2l/login',
          body: 'Please choose your campus', enabled: false, controls });
        changes[0]({ [key]: { oldValue: 'configured', newValue: undefined } }, 'local');
        changes[0]({ enabled: { oldValue: false, newValue: true } }, 'local');
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(clicked, [], `Changing ${key} prevents use of stale settings after enabling`);
      }
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
      const clicked = [];
      const controls = [element('Use your password instead', () => clicked.push('password'))];
      await contentPage({ hostname: 'login.microsoftonline.com',
        pathname: '/organizations/oauth2/v2.0/authorize',
        body: 'Purdue University\ntest@purdue.edu\nUse your password instead',
        brand: true, controls });
      assert.deepEqual(clicked, ['password'], 'Continue a branded Purdue Outlook sign-in for the saved account');
      clicked.length = 0;
      await contentPage({ hostname: 'login.microsoftonline.com',
        pathname: '/organizations/oauth2/v2.0/authorize',
        body: 'Purdue University\nother@purdue.edu\nUse your password instead',
        brand: true, controls });
      assert.deepEqual(clicked, [], 'Leave another Purdue account manual');
      await contentPage({ hostname: 'login.microsoftonline.com',
        pathname: '/organizations/oauth2/v2.0/authorize',
        body: 'test@purdue.edu\nUse your password instead', controls });
      assert.deepEqual(clicked, [], 'Do not use an unbranded Outlook prompt as Purdue context');
    }

  });
}

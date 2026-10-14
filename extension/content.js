(async () => {
  'use strict';
  const extensionApi = globalThis.browser ?? globalThis.chrome;
  const { generateTotp } = globalThis.PurdueTotp;
  const config = await extensionApi.storage.local.get(['username', 'password', 'totp_uri', 'enabled', 'campus']);
  config.username = (config.username || '').trim().replace(/@purdue\.edu$/i, '');
  config.email = config.username + '@purdue.edu';
  const ready = config.username && config.password && config.totp_uri;
  const tenant = '4130bd39-7c53-419c-b1e5-8758d6d63f21';
  const microsoft = location.hostname === 'login.microsoftonline.com';
  const brightspace = location.hostname === 'purdue.brightspace.com';
  if (location.protocol !== 'https:' || ![
    'sso.purdue.edu', 'idp.purdue.edu', 'login.microsoftonline.com', 'purdue.brightspace.com',
  ].includes(location.hostname)) return;

  const prefix = 'purdue-autologin:';
  const email = config.email.toLowerCase();
  const campusChoice = config.campus || 'Purdue West Lafayette / Indianapolis';
  let stopped = !ready;
  let enabled = config.enabled === true;
  let busy = false;
  const done = new Set();
  let started = Date.now();
  let timer;
  extensionApi.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    // Open pages must never keep using credentials after settings are changed
    // or cleared. Reloading starts a new run with the latest saved settings.
    if (['username', 'password', 'totp_uri', 'campus'].some(key =>
      changes[key] && changes[key].oldValue !== changes[key].newValue)) {
      stopped = true;
      clearInterval(timer);
      return;
    }
    if (changes.enabled && changes.enabled.oldValue !== changes.enabled.newValue) {
      enabled = changes.enabled.newValue === true;
      scheduleTicks();
    }
  });

  function visible(element) {
    return !!element && !element.disabled && element.getAttribute('aria-disabled') !== 'true'
      // Microsoft retains an off-screen password input on its username page.
      // It has layout rectangles but explicitly marks itself aria-hidden.
      && !element.closest('[aria-hidden="true"], [hidden]')
      && element.getClientRects().length > 0
      && getComputedStyle(element).visibility !== 'hidden';
  }
  function find(selector) {
    return Array.from(document.querySelectorAll(selector)).find(visible);
  }
  function control(pattern) {
    return Array.from(document.querySelectorAll('button, a, input[type="submit"], [role="button"]'))
      .find(element => visible(element) && pattern.test(
        (element.getAttribute('aria-label') || element.innerText || element.value || '').trim(),
      ));
  }
  function campusLabel(element) {
    return (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }
  function campusLink() {
    const matches = element => visible(element) && campusLabel(element) === campusChoice.toLowerCase();
    const link = Array.from(document.querySelectorAll('button, a, [role="button"]')).find(matches);
    if (link) return link;
    for (const block of document.querySelectorAll('d2l-html-block[html]')) {
      const rendered = Array.from(block.shadowRoot?.querySelectorAll('a') || []).find(matches);
      if (rendered) return rendered;
      // Brightspace also stores the links as HTML on the component. This works
      // when its rendered links are inside a closed shadow root.
      const parsed = new DOMParser().parseFromString(block.getAttribute('html') || '', 'text/html');
      const stored = Array.from(parsed.querySelectorAll('a'))
        .find(element => campusLabel(element) === campusChoice.toLowerCase());
      if (stored) {
        const url = new URL(stored.getAttribute('href'), location.href);
        const allowed = campusChoice === 'Purdue Global'
          ? url.origin === 'https://campus.purdueglobal.edu'
          : url.origin === 'https://purdue.brightspace.com'
            && url.pathname === '/d2l/lp/auth/saml/initiate-login';
        if (allowed) return { click: () => location.assign(url.href) };
      }
    }
    return null;
  }
  function fill(element, value) {
    if (!element || (element.value && element.value !== value)) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  function claim(step) {
    const key = prefix + step;
    if (done.has(step)) return false;
    // Survives full-page reloads, preventing repeated failed password submissions.
    const last = Number(sessionStorage.getItem(key) || 0);
    if (Date.now() - last < 60_000) return false;
    done.add(step);
    sessionStorage.setItem(key, String(Date.now()));
    return true;
  }
  function click(step, element) {
    if (element && claim(step)) element.click();
  }
  function identity() {
    const candidates = Array.from(document.querySelectorAll(
      '#displayName, #signInName, #userDisplayName, input[name="login"], input[name="loginfmt"]',
    )).map(el => (el.value || el.textContent || '').trim().toLowerCase()).filter(Boolean);
    const password = find('input[type="password"]');
    const label = password?.getAttribute('aria-label') || '';
    const labelEmail = label.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
    if (labelEmail) candidates.push(labelEmail[0].toLowerCase());
    return candidates;
  }
  function purdueContext() {
    if (!microsoft) return true;
    const text = document.body?.innerText || '';
    const branded = /purdue university/i.test(text)
      || !!document.querySelector('img[alt*="Purdue" i], [aria-label*="Purdue" i]');
    const visibleAccounts = branded ? (text.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi) || []) : [];
    const accounts = [...identity(), ...visibleAccounts.map(account => account.toLowerCase())];
    if (accounts.some(account => account !== email && account !== config.username.toLowerCase())) return false;
    if (accounts.includes(email) || location.pathname.split('/')[1].toLowerCase() === tenant) {
      sessionStorage.setItem(prefix + 'context', String(Date.now()));
      return true;
    }
    return Date.now() - Number(sessionStorage.getItem(prefix + 'context') || 0) < 300_000;
  }

  function purdueAccountPicker(text) {
    if (!microsoft || !/pick an account/i.test(text)) return false;
    const branded = /purdue university/i.test(text)
      || !!document.querySelector('img[alt*="Purdue" i], [aria-label*="Purdue" i]');
    return branded || location.pathname.toLowerCase().includes(tenant);
  }

  function savedAccountTile() {
    const candidates = Array.from(document.querySelectorAll(
      'button, a, [role="button"], [data-test-id], .table',
    ));
    return candidates.filter(element => {
      if (!visible(element)) return false;
      const addresses = (element.textContent || '').match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi) || [];
      return addresses.length === 1 && addresses[0].toLowerCase() === email;
    }).sort((a, b) => a.textContent.length - b.textContent.length)[0];
  }

  async function tick() {
    const now = Date.now();
    if (busy || stopped || !enabled) return;
    if (now - started > 180_000) return;
    busy = true;
    try {
      const text = document.body?.innerText || '';
      if (brightspace) {
        if (location.pathname.toLowerCase() !== '/d2l/login') return;
        click('campus', campusLink());
        return;
      }
      if (purdueAccountPicker(text)) {
        click('account', savedAccountTile());
        return;
      }
      if (!purdueContext()) return;
      // This is a separate post-authentication screen. Handle it before stale
      // login inputs or generic live-region alerts can mask the prompt.
      if (microsoft && /stay signed in\?/i.test(text)) {
        const yes = control(/^yes$/i);
        const checkbox = Array.from(document.querySelectorAll('input[type="checkbox"]')).find(element => {
          const labels = Array.from(element.labels || []);
          const label = [element.getAttribute('aria-label') || '', ...labels.map(item => item.textContent)].join(' ');
          return (visible(element) || labels.some(visible)) && /don['’]t show (?:this )?again/i.test(label);
        });
        if (!yes || !checkbox) return;
        if (!checkbox.checked) checkbox.click();
        if (checkbox.checked) click('stay-signed-in', yes);
        return;
      }
      const password = find('input[type="password"]');
      const username = find('input[name="loginfmt"], input[name="j_username"], input[name="username"], #username');
      const otp = find('#idTxtBx_SAOTCC_OTC, input[name="otc"], input[autocomplete="one-time-code"]');
      const error = Array.from(document.querySelectorAll(
        '#passwordError, #usernameError, #idDiv_SAOTCC_Error, #idDiv_SAOTCS_Error, #idDiv_SAOTCAS_Error, [role="alert"]',
      )).some(element => visible(element) && element.textContent.trim());

      // An error can belong to the previous MFA method (for example a timed-out
      // app approval). Follow offered alternatives before blocking submission.
      // Prefer the code form once it is open, and keep each navigation one-shot.
      const useCode = control(/^use a verification code$/i);
      if (!otp && useCode) { click('use-code', useCode); return; }
      const usePassword = control(/^(?:use (?:your|a) password(?: instead)?|sign in with (?:your|a) password)$/i);
      if (!password && !otp && usePassword) { click('use-password', usePassword); return; }
      const otherMethod = control(/^(?:I can.t use my .+ right now|sign in another way|use a different verification option)$/i);
      if (!otp && !password && otherMethod) { click('other-method', otherMethod); return; }

      // Block the current form while its error is visible, but keep observing:
      // clearing the message or changing methods must not require a reload.
      if (error) return;
      if (password) {
        const submit = control(/^(sign in|log in|login)$/i);
        if (!submit) return;
        if (username && !fill(username, microsoft ? config.email : config.username)) return;
        if (fill(password, config.password)) click('password', submit);
        return;
      }
      if (otp && /enter (?:a |the )?code|verification code/i.test(text)) {
        const submit = control(/^(verify|sign in|continue)$/i);
        if (!submit || done.has('otp')) return;
        const period = Number(new URL(config.totp_uri).searchParams.get('period') || 30);
        // Wait for a fresh code when the current one is about to expire.
        if (period - (Date.now() / 1000 % period) < 5) return;
        const code = await generateTotp(config.totp_uri);
        if (!stopped && enabled && visible(otp) && visible(submit)
          && purdueContext() && fill(otp, code)) click('otp', submit);
        return;
      }
      if (username) {
        const next = control(/^(next|continue|sign in)$/i);
        if (next && fill(username, microsoft ? config.email : config.username)) click('username', next);
        return;
      }
    } catch {
      stopped = true;
      console.info('Purdue automatic sign-in stopped. Check your settings and reload the sign-in page.');
    } finally {
      busy = false;
    }
  }
  function scheduleTicks() {
    clearInterval(timer);
    if (stopped || !enabled) return;
    started = Date.now();
    void tick();
    timer = setInterval(() => {
      if (stopped || Date.now() - started > 180_000) clearInterval(timer);
      else void tick();
    }, 600);
  }
  scheduleTicks();

})();

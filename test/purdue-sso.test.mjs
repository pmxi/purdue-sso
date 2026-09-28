import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { generateTotp as referenceTotp } from './reference-totp.mjs';

// Exercise the browser implementation without loading or printing real credentials.
const config = { username: 'test', email: 'test@purdue.edu', password: 'dummy', totp_uri: 'otpauth://totp/Test?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ' };
let source = await readFile(new URL('../purdue-sso.user.js', import.meta.url), 'utf8');
source = source.replace(/const config = \{[\s\S]*?\n  \};/, 'const config = ' + JSON.stringify(config) + ';');
source = source.slice(0, source.lastIndexOf('  scheduleTicks();'))
  + '  globalThis.testApi = { generateTotp, purdueContext, claim, fill, tick, visible, purdueAccountPicker, savedAccountTile }; return;\n})();';
let identities = [];
const session = new Map();
class Input {
  constructor() { this._value = ''; this.events = []; }
  set value(value) { this._value = value; }
  get value() { return this._value; }
  dispatchEvent(event) { this.events.push(event.type); }
}
const context = vm.createContext({
  URL, crypto: webcrypto, console, HTMLInputElement: Input,
  Event: class { constructor(type) { this.type = type; } },
  location: { protocol: 'https:', hostname: 'login.microsoftonline.com', pathname: '/common/login' },
  GM_getValue: (_, fallback) => fallback, GM_registerMenuCommand() {},
  sessionStorage: { getItem: key => session.get(key), setItem: (key, value) => session.set(key, value) },
  document: { querySelectorAll: selector => selector.startsWith('#displayName')
    ? identities.map(value => ({ value })) : [] },
});
vm.runInContext(source, context);
const { generateTotp, purdueContext, claim, fill } = context.testApi;
const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const uri = `otpauth://totp/Test?secret=${secret}&digits=8`;
for (const [seconds, expected] of [
  [59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'],
  [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130'],
]) assert.equal(await generateTotp(uri, seconds * 1000), expected);
for (const algorithm of ['SHA1', 'SHA256', 'SHA512']) {
  for (const period of [30, 60]) {
    const variation = `${uri}&algorithm=${algorithm}&period=${period}`;
    assert.equal(await generateTotp(variation, 1234567890000), referenceTotp(variation, 1234567890000));
  }
}
await assert.rejects(generateTotp('https://example.com'));
await assert.rejects(generateTotp('otpauth://totp/Test?secret=INVALID!'));
assert.equal(purdueContext(), false, 'Generic Microsoft login must remain untouched');
context.location.pathname = '/4130bd39-7c53-419c-b1e5-8758d6d63f21/login';
assert.equal(purdueContext(), true);
identities = ['someone@other.edu'];
assert.equal(purdueContext(), false, 'Wrong account must win over tenant and remembered context');
identities = ['test@purdue.edu'];
assert.equal(purdueContext(), true);
assert.equal(claim('password'), true);
assert.equal(claim('password'), false, 'Never submit the same step twice in one document');
session.set('purdue-autologin:otp', String(Date.now()));
assert.equal(claim('otp'), false, 'Recent submissions must survive reload');
const input = new Input();
assert.equal(fill(input, 'dummy'), true);
assert.equal(input.value, 'dummy');
assert.deepEqual(input.events, ['input', 'change']);
input.value = 'user-entered-value';
assert.equal(fill(input, 'dummy'), false, 'Preserve values entered by the user');
assert.equal(input.value, 'user-entered-value');
console.log('Passed: RFC TOTP vectors, algorithm/period parity, invalid configuration, account guards, duplicate submissions, and input handling.');

// Microsoft keeps #i0118 on the username page with aria-hidden=true but
// nonzero layout rectangles. It must not take precedence over the email form.
const username = new Input();
Object.assign(username, {
  getAttribute: () => null, closest: () => null,
  getClientRects: () => [{}],
});
const hiddenPassword = new Input();
Object.assign(hiddenPassword, {
  getAttribute: name => name === 'aria-hidden' ? 'true' : null,
  closest: () => hiddenPassword, getClientRects: () => [{}],
});
let submissions = 0;
const next = {
  value: 'Next', getAttribute: () => null, closest: () => null,
  getClientRects: () => [{}], click: () => { submissions++; },
};
context.getComputedStyle = () => ({ visibility: 'visible' });
context.document.body = { innerText: 'Sign in Next' };
context.document.querySelectorAll = selector => {
  if (selector.startsWith('#displayName')) return [username];
  if (selector === 'input[type="password"]') return [hiddenPassword];
  if (selector.startsWith('input[name="loginfmt"]')) return [username];
  if (selector.startsWith('button, a,')) return [next];
  return [];
};
assert.equal(context.testApi.visible(hiddenPassword), false);
await context.testApi.tick();
assert.equal(username.value, config.email);
assert.equal(hiddenPassword.value, '', 'Never fill the hidden password decoy');
assert.equal(submissions, 1, 'Submit Next on a fresh username screen');
await context.testApi.tick();
assert.equal(submissions, 1, 'Repeated polling must not resubmit Next');
console.log('Passed: username screen with off-screen password decoy.');

// The post-authentication prompt lives under /common and may retain old form
// controls and a generic live-region alert. It must take precedence over both.
context.location.pathname = '/common/SAS/ProcessAuth';
for (const initiallyChecked of [false, true]) {
  vm.runInContext(source, context);
  session.delete('purdue-autologin:stay-signed-in');
  const actions = [];
  let showCheckbox = false;
  const checkbox = {
    checked: initiallyChecked, labels: [{ textContent: "Don't show this again" }],
    getAttribute: () => null, closest: () => null, getClientRects: () => [{}],
    click() { this.checked = !this.checked; actions.push('checkbox'); },
  };
  const yes = { ...next, value: 'Yes', click() {
    assert.equal(checkbox.checked, true, 'Check the preference before submitting');
    actions.push('yes');
  } };
  context.document.body.innerText = "Stay signed in? Don't show this again No Yes";
  context.document.querySelectorAll = selector => {
    if (selector.startsWith('#displayName')) return [username];
    if (selector === 'input[type="checkbox"]') return showCheckbox ? [checkbox] : [];
    if (selector.startsWith('button, a,')) return [yes];
    if (selector.startsWith('#passwordError')) return [{ ...next, textContent: 'Stay signed in?' }];
    if (selector.startsWith('input[name="loginfmt"]')) return [username];
    return [];
  };
  await context.testApi.tick();
  assert.deepEqual(actions, [], 'Wait for the preference checkbox to load');
  showCheckbox = true;
  // A different account must still prevent any action on the common endpoint.
  const savedUsername = username.value;
  username.value = 'another@purdue.edu';
  await context.testApi.tick();
  assert.deepEqual(actions, []);
  username.value = savedUsername;
  await context.testApi.tick();
  await context.testApi.tick();
  assert.deepEqual(actions, initiallyChecked ? ['yes'] : ['checkbox', 'yes']);
}
console.log('Passed: stay-signed-in preference, Yes ordering, existing checkbox state, delayed controls, account guard, and duplicate prevention.');

// Model SPA transitions: an error can arrive before its recovery controls, and
// remain visible on the method picker after the original challenge has failed.
function recoveryPage() {
  const actions = [];
  const state = { errors: [], controls: [], password: null, otp: null, account: config.email };
  const storage = new Map();
  const element = (text, click = () => {}) => ({
    innerText: text, textContent: text, value: '', click,
    getAttribute: () => null, closest: () => null, getClientRects: () => [{}],
  });
  const input = () => Object.assign(new Input(), {
    getAttribute: () => null, closest: () => null, getClientRects: () => [{}],
  });
  const button = text => element(text, () => actions.push(text));
  const page = vm.createContext({
    URL, crypto: webcrypto, console, HTMLInputElement: Input, Event: context.Event,
    Date: class extends Date { static now() { return 1_234_567_890_000; } },
    location: { protocol: 'https:', hostname: 'login.microsoftonline.com', pathname: '/common/login' },
    GM_getValue: (_, fallback) => fallback, GM_registerMenuCommand() {},
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    getComputedStyle: () => ({ visibility: 'visible' }),
    document: {
      body: { innerText: 'Verify your identity Enter a verification code' },
      querySelectorAll(selector) {
        if (selector.startsWith('#displayName')) return [{ value: state.account }];
        if (selector.startsWith('#passwordError')) return state.errors;
        if (selector.startsWith('button, a,')) return state.controls;
        if (selector === 'input[type="password"]') return state.password ? [state.password] : [];
        if (selector.startsWith('#idTxtBx_SAOTCC_OTC')) return state.otp ? [state.otp] : [];
        return [];
      },
    },
  });
  const reload = () => vm.runInContext(source, page);
  reload();
  return { state, actions, element, button, input, reload, tick: () => page.testApi.tick() };
}

for (const message of [
  "Sorry, we're having trouble verifying your account. Please try again.",
  'Your request has timed out.',
  'An unfamiliar authentication error',
]) {
  const p = recoveryPage();
  p.state.errors = [p.element(message)];
  await p.tick(); // The picker has not rendered yet: do not permanently stop.
  p.state.controls = [p.button('Use a verification code')];
  await p.tick();
  await p.tick();
  p.reload();
  await p.tick();
  assert.deepEqual(p.actions, ['Use a verification code'], 'Choose a code once, including across reloads');
  p.state.errors = [];
  p.state.otp = p.input();
  p.state.controls = [p.button('Verify'), p.button('Sign in another way')];
  await p.tick();
  await p.tick();
  assert.match(p.state.otp.value, /^\d{6}$/);
  assert.deepEqual(p.actions, ['Use a verification code', 'Verify'], 'Continue into the code form');
  p.state.errors = [p.element('Incorrect code')];
  await p.tick();
  p.state.errors = [];
  p.state.otp.value = '';
  await p.tick();
  assert.equal(p.actions.length, 2, 'Never resubmit a rejected code or navigate away from its form');
}

for (const label of ["I can't use my Microsoft Authenticator app right now", 'Sign in another way', 'Use a different verification option']) {
  const p = recoveryPage();
  p.state.errors = [p.element('App approval failed')];
  p.state.controls = [p.button(label)];
  await p.tick();
  await p.tick();
  p.state.controls = [p.button('Use a verification code')];
  await p.tick();
  assert.deepEqual(p.actions, [label, 'Use a verification code']);
}

{
  const p = recoveryPage();
  p.state.errors = [p.element('Passwordless authentication failed')];
  p.state.controls = [p.button('Use your password')];
  await p.tick();
  p.state.password = p.input();
  p.state.controls = [p.button('Sign in')];
  // An empty, earlier error node must not mask a later nonempty error.
  p.state.errors = [p.element(''), p.element('Incorrect password')];
  await p.tick();
  assert.equal(p.state.password.value, '');
  assert.deepEqual(p.actions, ['Use your password']);
  p.state.errors = [];
  await p.tick();
  assert.equal(p.state.password.value, config.password);
  p.state.errors = [p.element('Incorrect password')];
  await p.tick();
  p.state.errors = [];
  await p.tick();
  assert.deepEqual(p.actions, ['Use your password', 'Sign in'], 'Never resubmit a rejected password');
}

{
  const p = recoveryPage();
  p.state.errors = [p.element('MFA failed')];
  p.state.controls = [p.button('Use a verification code')];
  p.state.account = 'someone@other.edu';
  await p.tick();
  assert.deepEqual(p.actions, [], 'Recovery must respect the account guard');
  p.state.account = config.email;
  p.state.controls[0].disabled = true;
  await p.tick();
  assert.deepEqual(p.actions, [], 'Wait for an enabled alternative');
  p.state.controls[0].disabled = false;
  await p.tick();
  assert.deepEqual(p.actions, ['Use a verification code']);
}
console.log('Passed: general error recovery, delayed alternatives, MFA/password transitions, account guards, and failed-submission protection.');

const extensionApi = globalThis.browser ?? globalThis.chrome;
const { validTotpUri, normalizeEnrollment, generateTotp } = globalThis.PurdueTotp;
const fields = ['username', 'password', 'totp_uri', 'campus', 'enabled'];
const status = document.querySelector('#status');
const form = document.querySelector('#settings');
const inputs = Object.fromEntries(fields.map(field => [field, document.querySelector(`#${field}`)]));
const code = document.querySelector('#current-code');
const codeTimer = document.querySelector('#code-timer');
const countdown = document.querySelector('#code-countdown');
const progress = document.querySelector('#code-progress');
const timers = new Map();
const errors = new Map();
let writes = Promise.resolve();
let pendingWrites = 0;
let clearing = false;
let codeUri = null;
let codeStep = -1;
let generating = false;

function showSaveStatus() {
  status.textContent = errors.size ? errors.values().next().value
    : timers.size || pendingWrites ? 'Saving…' : 'Saved automatically.';
}

function setCodeUri(uri) {
  if (uri === codeUri) return;
  codeUri = uri;
  codeStep = -1;
  code.textContent = '—';
  codeTimer.hidden = true;
  void updateCode();
}

async function updateCode() {
  if (!codeUri || generating) return;
  const uri = codeUri;
  const period = Number(new URL(uri).searchParams.get('period') || 30);
  const now = Date.now();
  const step = Math.floor(now / 1000 / period);
  const remaining = Math.ceil(period - (now / 1000 % period));
  countdown.textContent = `${remaining}s`;
  countdown.title = `Next code in ${remaining} seconds`;
  progress.max = period;
  progress.value = remaining;
  if (step === codeStep) return;
  code.textContent = '—';
  codeTimer.hidden = true;
  generating = true;
  try {
    const value = await generateTotp(uri, now);
    // Discard results if the key was edited/cleared or this code expired.
    if (uri !== codeUri || step !== Math.floor(Date.now() / 1000 / period)) return;
    code.textContent = value;
    codeStep = step;
    codeTimer.hidden = false;
  } catch {
    if (uri === codeUri) {
      code.textContent = '—';
      codeTimer.hidden = true;
    }
  } finally {
    generating = false;
  }
}

function fieldValue(field) {
  const input = inputs[field];
  if (field === 'enabled') return input.checked;
  if (field === 'username') return input.value.trim().replace(/@purdue\.edu$/i, '');
  if (field === 'totp_uri') return normalizeEnrollment(input.value, fieldValue('username'));
  return input.value;
}

function saveField(field) {
  if (!fields.includes(field) || clearing) return writes;
  clearTimeout(timers.get(field));
  timers.delete(field);
  const value = fieldValue(field);
  if (field !== 'enabled' && !value) {
    errors.set(field, field === 'totp_uri'
      ? 'Authenticator key is incomplete or invalid. It has not been saved.'
      : `Enter ${field === 'username' ? 'your career account' : 'a ' + field} to save it.`);
    showSaveStatus();
    return writes;
  }
  errors.delete(field);
  pendingWrites++;
  showSaveStatus();
  // Serialize writes so Clear settings always runs after any in-flight save.
  writes = writes.then(async () => {
    await extensionApi.storage.local.set({ [field]: value });
    if (!clearing && fieldValue(field) === value) {
      errors.delete(field);
      if (field === 'totp_uri') setCodeUri(value);
    }
  }).catch(() => {
    errors.set(field, 'Could not save changes. Edit the field to try again.');
  }).finally(() => {
    pendingWrites--;
    if (!clearing) showSaveStatus();
  });
  return writes;
}

const saved = await extensionApi.storage.local.get(fields);
for (const field of fields) {
  if (field === 'enabled') inputs[field].checked = saved.enabled === true;
  else if (field === 'campus') inputs[field].value = saved.campus || 'Purdue West Lafayette / Indianapolis';
  else inputs[field].value = saved[field] || '';
}
setCodeUri(validTotpUri(saved.totp_uri || '') ? saved.totp_uri : null);
setInterval(() => { void updateCode(); }, 1000);
document.addEventListener('visibilitychange', () => { void updateCode(); });

form.addEventListener('input', event => {
  const field = event.target.id;
  if (!fields.includes(field) || clearing) return;
  if (field === 'totp_uri') setCodeUri(null);
  if (field === 'enabled' || field === 'campus') return;
  clearTimeout(timers.get(field));
  errors.delete(field);
  timers.set(field, setTimeout(() => { void saveField(field); }, 400));
  showSaveStatus();
});
form.addEventListener('change', event => { void saveField(event.target.id); });
form.addEventListener('submit', event => {
  event.preventDefault();
  for (const field of [...timers.keys()]) void saveField(field);
});

extensionApi.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.enabled) inputs.enabled.checked = changes.enabled.newValue === true;
});

document.querySelector('#clear').addEventListener('click', async () => {
  clearing = true;
  form.inert = true;
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  setCodeUri(null);
  try {
    await writes;
    await extensionApi.storage.local.remove(fields);
    form.reset();
    errors.clear();
    status.textContent = 'Settings cleared. Reload any open Purdue sign-in page.';
  } catch {
    status.textContent = 'Could not clear settings. Please try again.';
  } finally {
    clearing = false;
    form.inert = false;
  }
});

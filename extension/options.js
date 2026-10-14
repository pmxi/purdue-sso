const extensionApi = globalThis.browser ?? globalThis.chrome;
const { validTotpUri, normalizeEnrollment, generateTotp } = globalThis.PurdueTotp;
const fields = ['username', 'password', 'totp_uri', 'campus', 'enabled'];
const status = document.querySelector('#status');
const form = document.querySelector('#settings');

async function showCurrentCode(uri) {
  document.querySelector('#current-code').textContent = await generateTotp(uri);
}

const saved = await extensionApi.storage.local.get(fields);
for (const field of fields) {
  const input = document.querySelector(`#${field}`);
  if (field === 'enabled') input.checked = saved.enabled === true;
  else if (field === 'campus') input.value = saved.campus || 'Purdue West Lafayette / Indianapolis';
  else input.value = saved[field] || '';
}
if (validTotpUri(saved.totp_uri || '')) await showCurrentCode(saved.totp_uri);

form.addEventListener('submit', async event => {
  event.preventDefault();
  const values = Object.fromEntries(fields.map(field => {
    const input = document.querySelector(`#${field}`);
    return [field, field === 'enabled' ? input.checked : input.value];
  }));
  values.username = values.username.trim().replace(/@purdue\.edu$/i, '');
  const uri = normalizeEnrollment(values.totp_uri, values.username);
  if (!uri) {
    status.textContent = 'Enter the setup key from Can’t scan QR Code? or a valid otpauth://totp/ URI.';
    return;
  }
  values.totp_uri = uri;
  await extensionApi.storage.local.set(values);
  await showCurrentCode(uri);
  status.textContent = 'Saved. Use the current code to finish authenticator setup, then reload any open Purdue sign-in page.';
});

document.querySelector('#clear').addEventListener('click', async () => {
  await extensionApi.storage.local.remove([...fields, 'manual_pause_until', 'auth_flow']);
  form.reset();
  document.querySelector('#current-code').textContent = '';
  status.textContent = 'Settings cleared. Reload any open Purdue sign-in page.';
});

document.querySelector('#refresh-code').addEventListener('click', async () => {
  const { totp_uri: uri } = await extensionApi.storage.local.get('totp_uri');
  if (validTotpUri(uri || '')) await showCurrentCode(uri);
});

const fields = ['username', 'password', 'totp_uri', 'enabled'];
const status = document.querySelector('#status');
const form = document.querySelector('#settings');

function validTotpUri(value) {
  try {
    const uri = new URL(value);
    const period = Number(uri.searchParams.get('period') || 30);
    const digits = Number(uri.searchParams.get('digits') || 6);
    const algorithm = (uri.searchParams.get('algorithm') || 'SHA1').toUpperCase();
    return uri.protocol === 'otpauth:' && uri.hostname === 'totp'
      && /^[A-Z2-7]+=*$/i.test(uri.searchParams.get('secret') || '')
      && Number.isInteger(period) && period > 0 && [6, 7, 8].includes(digits)
      && ['SHA1', 'SHA256', 'SHA512'].includes(algorithm);
  } catch { return false; }
}

const saved = await chrome.storage.local.get(fields);
for (const field of fields) {
  const input = document.querySelector(`#${field}`);
  if (field === 'enabled') input.checked = saved.enabled === true;
  else input.value = saved[field] || '';
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const values = Object.fromEntries(fields.map(field => {
    const input = document.querySelector(`#${field}`);
    return [field, field === 'enabled' ? input.checked : input.value];
  }));
  if (!validTotpUri(values.totp_uri)) {
    status.textContent = 'Enter a valid existing otpauth://totp/ enrollment URI.';
    return;
  }
  values.username = values.username.trim().replace(/@purdue\.edu$/i, '');
  await chrome.storage.local.set(values);
  status.textContent = 'Saved. Reload any open Purdue sign-in page to apply these settings.';
});

document.querySelector('#clear').addEventListener('click', async () => {
  await chrome.storage.local.remove(fields);
  form.reset();
  status.textContent = 'Settings cleared. Reload any open Purdue sign-in page.';
});

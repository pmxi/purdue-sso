const fields = ['username', 'password', 'totp_uri', 'campus', 'enabled'];
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

function normalizeEnrollment(value, username) {
  const input = value.trim();
  if (validTotpUri(input)) return input;
  const secret = input.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z2-7]{16,}=*$/.test(secret)) return null;
  const label = encodeURIComponent(`Purdue:${username}@purdue.edu`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=Purdue`;
}

function decodeBase32(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = [];
  let bits = 0;
  let buffer = 0;
  for (const character of value.replace(/=+$/, '')) {
    buffer = (buffer << 5) | alphabet.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 255);
      buffer &= (1 << bits) - 1;
    }
  }
  return new Uint8Array(bytes);
}

async function showCurrentCode(uri) {
  const url = new URL(uri);
  const secret = url.searchParams.get('secret').toUpperCase();
  const period = Number(url.searchParams.get('period') || 30);
  const digits = Number(url.searchParams.get('digits') || 6);
  const hash = { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA512: 'SHA-512' }[
    (url.searchParams.get('algorithm') || 'SHA1').toUpperCase()
  ];
  const counter = new Uint8Array(8);
  new DataView(counter.buffer).setBigUint64(0, BigInt(Math.floor(Date.now() / 1000 / period)));
  const key = await crypto.subtle.importKey('raw', decodeBase32(secret), { name: 'HMAC', hash }, false, ['sign']);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, counter));
  const offset = digest[digest.length - 1] & 15;
  const value = new DataView(digest.buffer).getUint32(offset) & 0x7fffffff;
  document.querySelector('#current-code').textContent = String(value % 10 ** digits).padStart(digits, '0');
}

const saved = await chrome.storage.local.get(fields);
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
  await chrome.storage.local.set(values);
  await showCurrentCode(uri);
  status.textContent = 'Saved. Use the current code to finish authenticator setup, then reload any open Purdue sign-in page.';
});

document.querySelector('#clear').addEventListener('click', async () => {
  await chrome.storage.local.remove([...fields, 'manual_pause_until', 'auth_flow']);
  form.reset();
  document.querySelector('#current-code').textContent = '';
  status.textContent = 'Settings cleared. Reload any open Purdue sign-in page.';
});

document.querySelector('#refresh-code').addEventListener('click', async () => {
  const { totp_uri: uri } = await chrome.storage.local.get('totp_uri');
  if (validTotpUri(uri || '')) await showCurrentCode(uri);
});

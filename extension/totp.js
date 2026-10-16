// Shared by the background context and settings page in their extension contexts.
(() => {
  'use strict';

  function parseEnrollment(uri) {
    const url = new URL(uri);
    const secret = url.searchParams.get('secret') || '';
    const period = Number(url.searchParams.get('period') || 30);
    const digits = Number(url.searchParams.get('digits') || 6);
    const hash = { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA512: 'SHA-512' }[
      (url.searchParams.get('algorithm') || 'SHA1').toUpperCase()
    ];
    if (url.protocol !== 'otpauth:' || url.hostname !== 'totp'
      || !/^[A-Z2-7]+=*$/i.test(secret) || !hash
      || !Number.isInteger(period) || period <= 0 || ![6, 7, 8].includes(digits)) {
      throw new Error('Invalid authenticator configuration');
    }
    return { secret, period, digits, hash };
  }

  function validTotpUri(value) {
    try { parseEnrollment(value); return true; }
    catch { return false; }
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
    for (const character of value.toUpperCase().replace(/=+$/, '')) {
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

  async function generateTotp(uri, now = Date.now()) {
    const { secret, period, digits, hash } = parseEnrollment(uri);
    const counter = new Uint8Array(8);
    new DataView(counter.buffer).setBigUint64(0, BigInt(Math.floor(now / 1000 / period)));
    const key = await crypto.subtle.importKey('raw', decodeBase32(secret), { name: 'HMAC', hash }, false, ['sign']);
    const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, counter));
    const offset = digest[digest.length - 1] & 15;
    const value = new DataView(digest.buffer).getUint32(offset) & 0x7fffffff;
    return String(value % 10 ** digits).padStart(digits, '0');
  }

  globalThis.PurdueTotp = Object.freeze({ validTotpUri, normalizeEnrollment, generateTotp });
})();

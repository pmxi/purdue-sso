// Only the background context opens this database. Never export the key.
export function createVault(storage, indexedDB = globalThis.indexedDB, crypto = globalThis.crypto) {
  const fields = ['username', 'password', 'totp_uri', 'campus'];
  const aad = new TextEncoder().encode('purdue-sso:credentials:v1');

  async function keyOperation(mode, operation) {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('purdue-sso-keys', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('keys');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction('keys', mode);
        const request = operation(transaction.objectStore('keys'));
        transaction.oncomplete = () => resolve(request.result);
        transaction.onabort = () => reject(transaction.error || new Error('Key storage failed'));
        transaction.onerror = () => reject(transaction.error);
      });
    } finally { db.close(); }
  }

  async function getKey(create = false) {
    let key = await keyOperation('readonly', store => store.get('credentials'));
    if (!key && create) {
      key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      await keyOperation('readwrite', store => store.add(key, 'credentials'));
    }
    if (!key || key.extractable || key.algorithm.name !== 'AES-GCM' || key.algorithm.length !== 256) {
      throw new Error('Credential key unavailable');
    }
    return key;
  }

  async function read() {
    const { vault, enabled } = await storage.get(['vault', 'enabled']);
    if (!vault) return { enabled: enabled === true, revision: null };
    if (vault.version !== 1 || !Array.isArray(vault.iv) || vault.iv.length !== 12 || !Array.isArray(vault.data)) {
      throw new Error('Invalid credential storage');
    }
    const key = await getKey();
    const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(vault.iv),
      additionalData: aad, tagLength: 128 }, key, new Uint8Array(vault.data));
    const settings = JSON.parse(new TextDecoder().decode(bytes));
    return { ...settings, enabled: enabled === true, revision: vault.iv.join('.') };
  }

  async function write(settings) {
    const { vault } = await storage.get(['vault']);
    const key = await getKey(!vault);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const profile = Object.fromEntries(fields.filter(field => settings[field] !== undefined)
      .map(field => [field, settings[field]]));
    const bytes = new TextEncoder().encode(JSON.stringify(profile));
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 }, key, bytes);
    await storage.set({ vault: { version: 1, iv: Array.from(iv), data: Array.from(new Uint8Array(data)) } });
  }

  async function migrate() {
    const saved = await storage.get([...fields, 'vault']);
    if (!fields.some(field => saved[field] !== undefined)) return;
    if (!saved.vault) await write(saved);
    // Remove old plaintext only after encrypted storage has been verified.
    await read();
    await storage.remove(fields);
  }

  async function clear() {
    await storage.remove(['vault', 'enabled', ...fields]);
    await keyOperation('readwrite', store => store.delete('credentials'));
  }

  return { read, write, migrate, clear };
}

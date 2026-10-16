globalThis.PurdueSettings = Object.freeze({
  async request(type, values = {}) {
    const response = await (globalThis.browser ?? globalThis.chrome).runtime.sendMessage({ type, ...values });
    if (!response?.ok) throw new Error(response?.error || 'Could not access saved settings.');
    return response.value;
  },
});

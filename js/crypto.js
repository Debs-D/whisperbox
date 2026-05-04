const Crypto = (() => {
  const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  function generateKeyPair() {
    return crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
    );
  }

  function generateSalt() {
    return crypto.getRandomValues(new Uint8Array(16));
  }

  async function deriveKey(password, salt, algorithm = 'AES-KW') {
    const enc = new TextEncoder();
    const km = await crypto.subtle.importKey(
      'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 310_000, hash: 'SHA-256' },
      km,
      { name: algorithm, length: 256 },
      false,
      ['wrapKey', 'unwrapKey']
    );
  }

  async function wrapPrivateKey(privateKey, wrappingKey) {
    const wrapped = await crypto.subtle.wrapKey('pkcs8', privateKey, wrappingKey, 'AES-KW');
    return toB64(wrapped);
  }

  function isLegacyWrapped(data) {
    return typeof data === 'string' && data.trimStart().startsWith('{');
  }

  async function unwrapPrivateKey(wrappedData, unwrappingKey) {
    if (isLegacyWrapped(wrappedData)) {
      const { wk, iv } = JSON.parse(wrappedData);
      return crypto.subtle.unwrapKey(
        'pkcs8', fromB64(wk), unwrappingKey,
        { name: 'AES-GCM', iv: fromB64(iv) },
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        true, ['decrypt', 'unwrapKey']
      );
    }
    return crypto.subtle.unwrapKey(
      'pkcs8', fromB64(wrappedData), unwrappingKey,
      'AES-KW',
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      true, ['decrypt', 'unwrapKey']
    );
  }

  async function exportPublicKey(key) {
    return toB64(await crypto.subtle.exportKey('spki', key));
  }

  function importPublicKey(b64) {
    return crypto.subtle.importKey(
      'spki',
      fromB64(b64),
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      true,
      ['encrypt', 'wrapKey']
    );
  }

  async function encryptMessage(plaintext, recipientPublicKey, senderPublicKey) {
    const aesKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      new TextEncoder().encode(plaintext)
    );

    const [encryptedKey, encryptedKeyForSelf] = await Promise.all([
      crypto.subtle.wrapKey('raw', aesKey, recipientPublicKey, { name: 'RSA-OAEP' }),
      crypto.subtle.wrapKey('raw', aesKey, senderPublicKey,    { name: 'RSA-OAEP' }),
    ]);

    return {
      ciphertext:          toB64(ciphertext),
      iv:                  toB64(iv),
      encryptedKey:        toB64(encryptedKey),
      encryptedKeyForSelf: toB64(encryptedKeyForSelf),
    };
  }

  async function decryptMessage(payload, privateKey, isSender) {
    const wrappedAes = fromB64(isSender ? payload.encryptedKeyForSelf : payload.encryptedKey);
    const aesKey = await crypto.subtle.unwrapKey(
      'raw',
      wrappedAes,
      privateKey,
      { name: 'RSA-OAEP' },
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(payload.iv) },
      aesKey,
      fromB64(payload.ciphertext)
    );
    return new TextDecoder().decode(plain);
  }

  return {
    generateKeyPair,
    generateSalt,
    deriveKey,
    isLegacyWrapped,
    wrapPrivateKey,
    unwrapPrivateKey,
    exportPublicKey,
    importPublicKey,
    encryptMessage,
    decryptMessage,
    toB64,
    fromB64,
  };
})();

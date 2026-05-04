# WhisperBox — End-to-End Encrypted Messaging

A secure messaging web app where every message is encrypted on your device before it reaches the server. The server stores only ciphertext; it never sees your plaintext messages or private key.

---

## Live Demo

Open `index.html` directly in a modern browser (Chrome 80+, Firefox 75+, Edge 80+).  
No build step required — pure HTML, CSS, and vanilla JavaScript.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                     Browser (Client)                  │
│                                                        │
│  ┌─────────────┐   ┌──────────────┐   ┌───────────┐  │
│  │   crypto.js  │   │    api.js    │   │   app.js  │  │
│  │  Web Crypto  │◄──│  REST calls  │◄──│  UI logic │  │
│  │     API      │   │  + JWT auth  │   │           │  │
│  └──────┬───────┘   └──────┬───────┘   └───────────┘  │
│         │                  │                            │
│  Private key (memory only) │                            │
└─────────┼──────────────────┼────────────────────────────┘
          │  HTTPS           │  HTTPS
          ▼                  ▼
┌─────────────────────────────────────────────────────────┐
│                  WhisperBox Backend                      │
│                                                          │
│   /auth/register   /auth/login    /auth/refresh          │
│   /users/search    /users/{id}/public-key                │
│   /conversations   /messages                             │
│                                                          │
│   Stores: ciphertext blobs, public keys,                 │
│           wrapped (encrypted) private keys, JWT tokens   │
│                                                          │
│   Never sees: plaintext, raw private keys, passwords     │
└─────────────────────────────────────────────────────────┘
```

---

## Encryption Flow

### Registration
```
1. Browser generates RSA-OAEP 2048-bit key pair
   └─ (publicKey, privateKey) via Web Crypto API

2. Browser generates a random 16-byte PBKDF2 salt

3. Browser derives a wrapping key from the user's password
   └─ PBKDF2(password, salt, 310,000 iterations, SHA-256) → AES-256-GCM key

4. Browser wraps (encrypts) the private key
   └─ AES-GCM wrap of privateKey → wrappedPrivateKey + IV

5. Server receives and stores:
   ├─ public_key          (SPKI, base64)
   ├─ wrapped_private_key (JSON: { wk: base64, iv: base64 })
   └─ pbkdf2_salt         (base64)

   Server never sees the raw private key or the password.
```

### Login / Key Recovery
```
1. Server returns wrapped_private_key + pbkdf2_salt

2. Browser re-derives the wrapping key:
   └─ PBKDF2(entered_password, pbkdf2_salt, 310,000 iterations) → AES-256-GCM key

3. Browser unwraps the private key
   └─ AES-GCM unwrap → privateKey (held in memory only, never written to storage)

4. Browser imports the public key for encryption
```

### Sending a Message (Hybrid Encryption)
```
1. Generate a fresh ephemeral AES-256-GCM key for this message

2. Encrypt the plaintext:
   └─ AES-GCM(ephemeralKey, randomIV, plaintext) → ciphertext

3. Encrypt the ephemeral key for the recipient:
   └─ RSA-OAEP(recipientPublicKey, ephemeralKey) → encryptedKey

4. Encrypt the ephemeral key for the sender (to read own messages):
   └─ RSA-OAEP(senderPublicKey, ephemeralKey) → encryptedKeyForSelf

5. POST /messages with payload:
   { ciphertext, iv, encryptedKey, encryptedKeyForSelf }

   Server stores the blob — plaintext is never transmitted.
```

### Receiving / Decrypting a Message
```
1. Fetch encrypted payload from server

2. Select the correct wrapped key:
   └─ recipient uses encryptedKey
   └─ sender    uses encryptedKeyForSelf

3. Unwrap the ephemeral AES key:
   └─ RSA-OAEP(myPrivateKey, encryptedKey) → ephemeralKey

4. Decrypt the message:
   └─ AES-GCM(ephemeralKey, iv, ciphertext) → plaintext
```

---

## Key Management

| Key | Where generated | Where stored | Who can access |
|-----|----------------|--------------|----------------|
| RSA-2048 public key | Client (registration) | Server (plaintext) | Anyone |
| RSA-2048 private key | Client (registration) | **Memory only** (runtime) | Only current browser tab |
| Wrapped private key | Client (registration) | Server (AES-GCM ciphertext) | Only with correct password |
| AES-256-GCM wrapping key | Client (derived from password) | Never stored anywhere | Derived on demand |
| Ephemeral message key | Client (per message) | Never stored anywhere | Derived per decrypt |

**Critical properties:**
- The private key is held only in a JavaScript module variable during the session. A page refresh requires the user to re-enter their password to re-derive the wrapping key and unwrap the private key from the server blob.
- No key material is ever written to `localStorage`, `sessionStorage`, `IndexedDB`, or cookies.
- The server cannot decrypt any message — it holds ciphertext blobs and a public key only.

---

## Security Trade-offs

### What this design protects against
- **Server breach** — attacker gains only ciphertext and wrapped keys. Without the user's password, messages are unreadable.
- **Man-in-the-middle** (with HTTPS) — all transport is encrypted; plaintext never travels over the wire.
- **Passive eavesdropping** — same as above.
- **Message replay** — AES-GCM authentication tag prevents ciphertext tampering; unique IVs prevent replay of the same block.

### Trade-offs made
| Decision | Benefit | Cost |
|----------|---------|------|
| PBKDF2 with 310k iterations | Strong password-based key derivation | ~1 second login time (intentional) |
| Private key stored (wrapped) on server | User can log in from any device | If password is weak, wrapping is weak |
| In-memory key storage only | Private key never touches persistent storage | Page refresh requires password re-entry |
| RSA-2048 (not ECDH) | Simpler API key agreement | Larger key size, slightly slower wrapping |
| One key pair per user (not per device) | Simpler UX | No device-level key isolation |

### Known Limitations
1. **No forward secrecy** — the same long-lived RSA key pair is used for all messages. Compromise of the private key exposes all past messages if ciphertext is retained.
2. **No multi-device key sync** — a second device login will re-derive the same private key, which is fine, but there is no mechanism for device-specific keys or key revocation.
3. **Username enumeration** — the `/users/search` endpoint reveals whether a username exists.
4. **No message deletion** — encrypted blobs remain on the server indefinitely.
5. **Browser memory** — the private key in a JS variable can theoretically be read by a malicious browser extension or cross-site script. Content Security Policy headers (server-side) would mitigate XSS; this demo does not configure them.
6. **Refresh token in sessionStorage** — cleared on tab close, but a running script in the same tab could read it. `HttpOnly` cookies would be stronger but require server changes.

---

## File Structure

```
whisperbox/
├── index.html          Single-page app shell
├── css/
│   └── style.css       Dark Signal-inspired UI
└── js/
    ├── crypto.js       All Web Crypto API operations (encryption, key mgmt)
    ├── api.js          REST client + silent JWT refresh
    ├── store.js        In-memory state (private key never leaves here)
    ├── ui.js           Pure DOM helpers and render functions
    └── app.js          App controller — auth flow, messaging, event binding
```

---

## Running Locally

```bash
# Any static file server works, e.g.:
npx serve .
# or
python -m http.server 8080
# then open http://localhost:8080
```

Opening `index.html` directly via `file://` also works in most browsers for the Web Crypto API.

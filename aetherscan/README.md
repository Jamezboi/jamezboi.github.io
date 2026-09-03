# AetherScan — Web Console (GitHub Pages)

The hosted front-end for AetherScan: a marketing landing page plus the full
console, which runs in two modes:

| Mode | What happens |
|---|---|
| **Demo** (default) | Everything runs in your browser against a simulated 12-device LAN — scans, audits, monitoring and licensing all work, no install needed. |
| **Live** (paired) | The console proxies `/api/*` to the AetherScan engine running on your own computer (`python main.py`), making the hosted page a real remote for scanning your network. |

## Files

```
index.html        landing page
console.html      the console (same UI as the desktop app)
js/config.js      deployment config (Google client ID, engine URL)
js/auth.js        sign-in gate: Google Identity + client-side JWT verification
js/license-web.js offline license-key verification (WebCrypto HMAC port)
js/demo-api.js    fetch shim: demo LAN simulation + live-engine proxy
js/app.js         console application (shared with the desktop build)
css/app.css       design system (shared with the desktop build)
```

## Enabling real Google sign-in

The console works immediately with a browser-local dev session. To require
real Google accounts:

1. Go to [Google Cloud Credentials](https://console.cloud.google.com/apis/credentials)
   → **Create credentials → OAuth client ID → Web application**.
2. Add **Authorized JavaScript origins**:
   - `https://jamezboi.github.io`
   - `http://localhost:8080` and `http://127.0.0.1:8080` (local testing)
3. Copy the client ID and either:
   - paste it into `js/config.js` (`clientId`), **or**
   - click *Set up real Google Sign-In* on the console's sign-in screen and
     paste it there (stored in that browser only).

Verification is fully client-side: the Google ID token's RS256 signature is
checked against Google's published JWKS via WebCrypto, plus `aud`/`iss`/
`exp`/`email_verified` claim checks. No server, no secrets shipped.

## Pairing the hosted console with your local engine

1. On your computer: `python main.py` (engine + its own local console start).
2. In the hosted console, click the **Engine: demo** pill.
3. Enter the engine URL (`http://127.0.0.1:8765`) and the session token
   printed in the engine's terminal → **Connect**.

The engine only accepts pairing origins listed in its `config.json`
(`pair_origins`, which includes `https://jamezboi.github.io` by default, plus
always localhost for development) and still requires the per-launch session
token. Chrome's Private Network Access preflight is answered by the engine.

## License verification on the web

`js/license-web.js` is an exact port of the desktop `LicenseManager` key
checksum (keyed HMAC-SHA256 mapped into the key alphabet), so keys generated
by `LicenseManager.generate_key()` activate on the web console and vice versa.
The dev key `AETHER-DEV-2026` unlocks everything here too.

> Production note: any client-side verifier ships its logic to the client.
> When selling keys for real, move issuance/verification to a tiny server
> (e.g. a Cloudflare Worker) and keep this offline path as a fallback.

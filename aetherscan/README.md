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

The no-Python flow (recommended, and what the console's *Engine: demo* pill now offers):

1. In the hosted console, click the **Engine: demo** pill → **Download my launcher (.bat)**.
   The launcher is generated per visitor: it embeds this site's origin, the console URL and the
   current release version.
2. Double-click `Start-AetherScan-<version>.bat`. It downloads the portable engine bundle
   (`engine/aetherscan-portable-<version>.zip`) into `%LOCALAPPDATA%\AetherScan` — the runtime
   inside is the **official Python.org embeddable build (PSF-signed)**, so **no Python install and
   no admin rights** are needed — then starts the engine and opens this console automatically.
3. The engine hands its pairing credentials to the console through the URL fragment
   (`#pair=...`, never sent to any server); the page pairs itself and the pill flips to
   **Engine: live**.

Manual pairing (paste engine URL + session token) remains available under
*Advanced → Manual pairing* in the same dialog.

### Update channel ("lock in, update, release")

- `engine/update.json` is the release manifest: `{"latest": "1.4.0", ...}`.
- The engine checks it at startup and reports `update.available` via `/api/status`; the console
  shows an update notice when the paired engine is behind.
- The launcher compares `version.txt` in `%LOCALAPPDATA%\AetherScan` against the manifest and
  re-downloads the bundle when a new version ships.
- **Release checklist:** bump `core/__version__` → rebuild the bundle (see below) → update
  `update.json:latest` → commit both → push. Users get the update on their next launcher run.

### Rebuilding the portable bundle

```
# from the project root
runtime/ = fresh python.org embeddable zip (amd64), with python314._pth edited to:
             python314.zip / . / ..\engine
engine/  = main.py + core/ + licensing/ + server/ + web/ + production config.json
zip both folders at the root as aetherscan-portable-<version>.zip
```

A PyInstaller one-file `AetherScan-Engine.exe` also builds fine
(`python -m PyInstaller --onefile --name AetherScan-Engine --add-data "web;web" main.py` with
frozen-path handling already in `main.py`), but unsigned exes get blocked by Windows Smart App
Control on many machines — the signed-runtime launcher is the default distribution.

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

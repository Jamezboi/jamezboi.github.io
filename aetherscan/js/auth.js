/* auth.js — sign-in gate for the AetherScan web console.
   ▸ Google Sign-In: uses Google Identity Services; the returned ID token is
     VERIFIED CLIENT-SIDE — RS256 signature against Google's published JWKS
     via WebCrypto, plus aud / iss / exp / email checks. No backend needed.
   ▸ Dev fallback: when no OAuth client ID is configured (or for quick
     testing), a local browser-only session unlocks the console. It is
     clearly labeled and never sent anywhere. */

(function () {
  "use strict";

  const cfg = window.AETHERSCAN_CONFIG || {};
  const LS_SESSION = "aetherscan-session";
  const LS_CLIENT_ID = "aetherscan-client-id";

  function storedClientId() {
    return (cfg.clientId || localStorage.getItem(LS_CLIENT_ID) || "").trim();
  }

  function getSession() {
    try {
      const s = JSON.parse(localStorage.getItem(LS_SESSION) || "null");
      if (s && s.exp && s.exp > Date.now() / 1000) return s;
      if (s) localStorage.removeItem(LS_SESSION);
    } catch { /* fresh */ }
    return null;
  }

  function setSession(session) {
    localStorage.setItem(LS_SESSION, JSON.stringify(session));
  }

  function signOut() {
    localStorage.removeItem(LS_SESSION);
    if (window.google?.accounts?.id) {
      try { google.accounts.id.disableAutoSelect(); } catch { /* noop */ }
    }
    location.reload();
  }

  /* ---------------- Google ID-token verification (client-side) -------- */

  function b64urlDecode(input) {
    const pad = input.length % 4 ? "=".repeat(4 - (input.length % 4)) : "";
    const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  async function verifyGoogleCredential(credential, clientId) {
    const [h, p, s] = credential.split(".");
    const header = JSON.parse(new TextDecoder().decode(b64urlDecode(h)));
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(p)));

    const resp = await fetch("https://www.googleapis.com/oauth2/v3/certs");
    if (!resp.ok) throw new Error("Could not fetch Google's public keys");
    const jwks = await resp.json();
    const jwk = jwks.keys.find(k => k.kid === header.kid);
    if (!jwk) throw new Error("Unknown key id in Google token");

    const key = await crypto.subtle.importKey(
      "jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const signature = b64urlDecode(s);
    const signedContent = new TextEncoder().encode(`${h}.${p}`);
    const signatureOk = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5", key, signature, signedContent);
    if (!signatureOk) throw new Error("Google token signature is invalid");

    const now = Math.floor(Date.now() / 1000);
    const issOk = ["accounts.google.com", "https://accounts.google.com"].includes(payload.iss);
    const audOk = payload.aud === clientId;
    const expOk = typeof payload.exp === "number" && payload.exp > now;
    const emailOk = !!payload.email && payload.email_verified !== false;
    if (!issOk || !audOk || !expOk || !emailOk) {
      throw new Error("Google token failed claim checks (aud/iss/exp/email)");
    }
    return {
      email: payload.email,
      name: payload.name || payload.email,
      picture: payload.picture || "",
      provider: "google",
      exp: payload.exp,
    };
  }

  /* ---------------- Gate UI -------------------------------------------- */

  function ensureGateStyles() {
    if (document.getElementById("aether-auth-style")) return;
    const style = document.createElement("style");
    style.id = "aether-auth-style";
    style.textContent = `
    #aether-auth-gate{position:fixed;inset:0;z-index:300;display:grid;place-items:center;
      background:
        radial-gradient(1100px 500px at 85% -10%, rgba(94,92,230,.16), transparent 60%),
        radial-gradient(900px 460px at -10% 110%, rgba(10,132,255,.14), transparent 60%),
        #0b0d12;}
    .auth-card{width:min(420px,92vw);background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);
      border-radius:24px;padding:34px;text-align:center;color:#f2f4f8;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;
      animation:authIn .4s cubic-bezier(.22,.8,.3,1)}
    @keyframes authIn{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}
    .auth-mark{width:56px;height:56px;border-radius:18px;margin:0 auto 16px;display:grid;place-items:center;
      background:linear-gradient(135deg,#0a84ff,#5e5ce6);box-shadow:0 8px 24px rgba(10,132,255,.4)}
    .auth-card h1{font-size:21px;letter-spacing:-.4px;margin-bottom:6px}
    .auth-card .sub{font-size:13px;color:#a6adbb;margin-bottom:22px;line-height:1.5}
    .auth-btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;
      padding:11px 16px;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;
      border:1px solid transparent;transition:transform .15s,box-shadow .15s;margin-top:10px}
    .auth-btn:active{transform:scale(.97)}
    .auth-btn.google{background:#fff;color:#1f1f1f}
    .auth-btn.google:hover{box-shadow:0 6px 18px rgba(255,255,255,.18)}
    .auth-btn.dev{background:rgba(255,255,255,.07);color:#f2f4f8;border-color:rgba(255,255,255,.14)}
    .auth-btn.dev:hover{background:rgba(255,255,255,.12)}
    .auth-divider{display:flex;align-items:center;gap:10px;color:#6b7280;font-size:11px;margin:18px 0 4px;
      text-transform:uppercase;letter-spacing:1px}
    .auth-divider::before,.auth-divider::after{content:"";flex:1;height:1px;background:rgba(255,255,255,.1)}
    .auth-input{width:100%;padding:10px 13px;border-radius:11px;margin-top:8px;
      background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);
      color:#f2f4f8;font-size:13px;outline:none;box-sizing:border-box}
    .auth-input:focus{border-color:#0a84ff}
    .auth-note{margin-top:18px;font-size:11px;color:#6b7280;line-height:1.5}
    .auth-error{margin-top:12px;font-size:12.5px;color:#ff453a;min-height:16px}
    .auth-setup{display:none;text-align:left;margin-top:14px;padding:12px;border-radius:12px;
      background:rgba(255,255,255,.04);border:1px dashed rgba(255,255,255,.15)}
    .auth-setup p{font-size:11.5px;color:#a6adbb;line-height:1.55;margin-bottom:8px}
    .auth-setup a{color:#64d2ff}
    .auth-userchip{display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:99px;
      background:var(--surface-strong);border:1px solid var(--border);cursor:pointer}
    .auth-userchip img,.auth-userchip .av{width:24px;height:24px;border-radius:50%;object-fit:cover;
      background:linear-gradient(135deg,#0a84ff,#5e5ce6);display:grid;place-items:center;
      font-size:11px;font-weight:700;color:#fff}
    .auth-userchip span{font-size:12px;color:var(--text-2);max-width:150px;overflow:hidden;
      text-overflow:ellipsis;white-space:nowrap}
    `;
    document.head.appendChild(style);
  }

  const BRAND_SVG = `<svg viewBox="0 0 24 24" width="28" height="28" fill="none">
      <circle cx="12" cy="12" r="2.4" fill="#fff"/>
      <circle cx="12" cy="12" r="6.2" stroke="#fff" stroke-width="1.4" opacity=".55"/>
      <circle cx="12" cy="12" r="10" stroke="#fff" stroke-width="1.2" opacity=".25"/></svg>`;

  const GOOGLE_G = `<svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.7-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.7-.4-3.9z"/></svg>`;

  function showGate() {
    ensureGateStyles();
    const gate = document.createElement("div");
    gate.id = "aether-auth-gate";
    gate.innerHTML = `
      <div class="auth-card">
        <div class="auth-mark">${BRAND_SVG}</div>
        <h1>AetherScan Console</h1>
        <p class="sub">Network intelligence for the networks you own.<br/>Sign in to open the console.</p>
        <div id="auth-slot-google"></div>
        <div class="auth-divider">or</div>
        <input class="auth-input" id="auth-name" placeholder="Your name (dev session)" autocomplete="off"/>
        <input class="auth-input" id="auth-email" placeholder="you@example.com (stays in this browser)" autocomplete="off"/>
        <button class="auth-btn dev" id="auth-dev-btn">Continue with dev session</button>
        <div class="auth-error" id="auth-error"></div>
        <div class="auth-setup" id="auth-setup">
          <p><b>Enable real Google sign-in</b> (optional): create an OAuth client ID
             (type <i>Web application</i>) at <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Google Cloud Credentials</a>
             and add <code>https://jamezboi.github.io</code> as an Authorized JavaScript origin.
             Paste the client ID here — it is saved in this browser only.</p>
          <input class="auth-input" id="auth-clientid" placeholder="xxxx.apps.googleusercontent.com" spellcheck="false"/>
          <button class="auth-btn dev" id="auth-save-cid" style="margin-top:10px">Save client ID & reload</button>
        </div>
        <p class="auth-note">Verification is performed entirely in your browser:
           Google's token signature is checked against Google's published public keys (WebCrypto),
           and license keys use the same offline checksum as the desktop engine.
           For auditing networks you own or are authorized to test.</p>
      </div>`;
    document.body.appendChild(gate);

    const errBox = gate.querySelector("#auth-error");

    // Google button when a client id exists
    const clientId = storedClientId();
    if (clientId) {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = () => {
        try {
          google.accounts.id.initialize({
            client_id: clientId,
            callback: async (response) => {
              try {
                const session = await verifyGoogleCredential(response.credential, clientId);
                setSession(session);
                // Server-side link (authoritative) when a backend is configured.
                if (window.AetherCloud && window.AetherCloud.enabled()) {
                  window.AetherCloud.loginGoogle(response.credential)
                    .then((r) => { if (r.ok && r.user) session.username = r.user.username; })
                    .catch(() => {});
                }
                gate.remove();
                document.dispatchEvent(new CustomEvent("aetherscan:auth", { detail: session }));
              } catch (err) {
                errBox.textContent = `Sign-in failed: ${err.message}`;
              }
            },
          });
          google.accounts.id.renderButton(gate.querySelector("#auth-slot-google"),
            { theme: "filled_black", size: "large", shape: "pill", width: 320 });
        } catch (err) {
          errBox.textContent = `Google Sign-In init failed: ${err.message}`;
        }
      };
      document.head.appendChild(script);
    }

    gate.querySelector("#auth-dev-btn").addEventListener("click", () => {
      const name = gate.querySelector("#auth-name").value.trim();
      const email = gate.querySelector("#auth-email").value.trim();
      if (!name || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        errBox.textContent = "Enter a name and a valid email for the dev session.";
        return;
      }
      setSession({ name, email, provider: "dev",
        exp: Math.floor(Date.now() / 1000) + 30 * 24 * 3600 });
      gate.remove();
      document.dispatchEvent(new CustomEvent("aetherscan:auth", { detail: getSession() }));
    });

    // setup toggle when no client id
    if (!clientId) {
      const setup = gate.querySelector("#auth-setup");
      const note = gate.querySelector(".auth-note");
      const toggle = document.createElement("button");
      toggle.className = "auth-btn dev";
      toggle.style.fontSize = "12px";
      toggle.textContent = "⚙ Set up real Google Sign-In";
      toggle.addEventListener("click", () => {
        setup.style.display = setup.style.display === "block" ? "none" : "block";
      });
      note.parentNode.insertBefore(toggle, note);
      gate.querySelector("#auth-save-cid").addEventListener("click", () => {
        const value = gate.querySelector("#auth-clientid").value.trim();
        if (!value.endsWith("apps.googleusercontent.com")) {
          errBox.textContent = "That doesn't look like an OAuth client ID.";
          return;
        }
        localStorage.setItem(LS_CLIENT_ID, value);
        location.reload();
      });
    }
  }

  function userChip(session) {
    const host = document.querySelector(".topbar-right");
    if (!host || document.getElementById("aether-userchip")) return;
    const chip = document.createElement("div");
    chip.className = "auth-userchip";
    chip.id = "aether-userchip";
    chip.title = `${session.name} · ${session.email} — click to sign out`;
    const initial = (session.name || session.email || "?").trim().charAt(0).toUpperCase();
    chip.innerHTML = session.picture
      ? `<img src="${session.picture}" alt=""/><span>${session.email}</span>`
      : `<span class="av">${initial}</span><span>${session.email}</span>`;
    chip.addEventListener("click", () => {
      if (confirm("Sign out of the AetherScan console?")) signOut();
    });
    host.prepend(chip);
  }

  function boot() {
    const session = getSession();
    if (!session) {
      showGate();
      // hide the app behind the gate until authenticated
      document.getElementById("app")?.style.setProperty("filter", "blur(6px)");
      document.addEventListener("aetherscan:auth", () => {
        document.getElementById("app")?.style.removeProperty("filter");
      }, { once: true });
    } else {
      document.addEventListener("DOMContentLoaded", () => userChip(session));
      if (document.readyState !== "loading") userChip(session);
    }
  }

  window.AetherAuth = { boot, getSession, signOut, verifyGoogleCredential };
  boot();
})();
